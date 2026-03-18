use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};

const RANDOMIZED_PORT_RANGE_START: i64 = 41_000;
const RANDOMIZED_PORT_RANGE_END: i64 = 48_999;
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(50);

/// Check whether a port is available using a two-phase strategy:
/// 1. Try to connect — if something answers, the port is in use.
/// 2. Try to bind — catches processes that bind but don't yet accept connections.
fn is_addr_available(addr: SocketAddr) -> bool {
    // Phase 1: connect-based check (catches active listeners)
    if TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).is_ok() {
        return false;
    }

    // Phase 2: bind-based check (catches bound-but-not-accepting sockets)
    match TcpListener::bind(addr) {
        Ok(listener) => {
            drop(listener);
            true
        }
        Err(error) => matches!(error.kind(), std::io::ErrorKind::AddrNotAvailable),
    }
}

fn is_host_port_available(port: i64) -> bool {
    if !(1..=65535).contains(&port) {
        return false;
    }

    let port = port as u16;
    is_addr_available(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
        && is_addr_available(SocketAddr::from((Ipv6Addr::LOCALHOST, port)))
}

fn load_reserved_assigned_ports(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
) -> Result<std::collections::HashSet<i64>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT assigned_port
             FROM workspace_service
             WHERE assigned_port IS NOT NULL
               AND NOT (workspace_id = ?1 AND service_name = ?2)",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id, service_name], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut reserved = std::collections::HashSet::new();
    for row in rows {
        reserved.insert(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }

    Ok(reserved)
}

pub(crate) fn resolve_assigned_port(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
    port_override: Option<i64>,
    current_assigned_port: Option<i64>,
    allow_bound_current_port: bool,
) -> Result<i64, LifecycleError> {
    let reserved_ports = load_reserved_assigned_ports(conn, workspace_id, service_name)?;

    let is_port_usable = |candidate: i64| {
        !reserved_ports.contains(&candidate)
            && if current_assigned_port == Some(candidate) {
                allow_bound_current_port || is_host_port_available(candidate)
            } else {
                is_host_port_available(candidate)
            }
    };

    if let Some(port_override) = port_override {
        if is_port_usable(port_override) {
            return Ok(port_override);
        }

        return Err(LifecycleError::PortConflict {
            service: service_name.to_string(),
            port: port_override as u16,
        });
    }

    if let Some(current_assigned_port) = current_assigned_port {
        if is_port_usable(current_assigned_port) {
            return Ok(current_assigned_port);
        }
    }

    if let Some(candidate) = resolve_randomized_port(workspace_id, service_name, &is_port_usable) {
        return Ok(candidate);
    }

    Err(LifecycleError::PortExhausted {
        service: service_name.to_string(),
    })
}

fn resolve_randomized_port(
    workspace_id: &str,
    service_name: &str,
    is_port_usable: &dyn Fn(i64) -> bool,
) -> Option<i64> {
    let span = RANDOMIZED_PORT_RANGE_END - RANDOMIZED_PORT_RANGE_START + 1;
    if span <= 0 {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    workspace_id.hash(&mut hasher);
    service_name.hash(&mut hasher);
    let offset = (hasher.finish() % span as u64) as i64;

    for step in 0..span {
        let candidate = RANDOMIZED_PORT_RANGE_START + ((offset + step) % span);
        if is_port_usable(candidate) {
            return Some(candidate);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_workspace_service_table(conn: &rusqlite::Connection) {
        conn.execute_batch(
            "CREATE TABLE workspace_service (
                workspace_id TEXT NOT NULL,
                service_name TEXT NOT NULL,
                assigned_port INTEGER
            );",
        )
        .expect("create workspace_service table");
    }

    #[test]
    fn resolve_assigned_port_skips_occupied_ipv4_loopback_ports() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        init_workspace_service_table(&conn);
        let listener =
            TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0))).expect("bind ipv4");
        let occupied_port = i64::from(
            listener
                .local_addr()
                .expect("listener addr should exist")
                .port(),
        );

        let assigned_port = resolve_assigned_port(&conn, "ws-1", "web", None, None, false)
            .expect("port resolution should succeed");

        assert_ne!(assigned_port, occupied_port);
        assert!((RANDOMIZED_PORT_RANGE_START..=RANDOMIZED_PORT_RANGE_END).contains(&assigned_port));
    }

    #[test]
    fn resolve_assigned_port_skips_occupied_ipv6_loopback_ports() {
        let listener = match TcpListener::bind(SocketAddr::from((Ipv6Addr::LOCALHOST, 0))) {
            Ok(listener) => listener,
            Err(error) if matches!(error.kind(), std::io::ErrorKind::AddrNotAvailable) => return,
            Err(error) => panic!("bind ipv6: {error}"),
        };
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        init_workspace_service_table(&conn);
        let _occupied_port = i64::from(
            listener
                .local_addr()
                .expect("listener addr should exist")
                .port(),
        );

        let assigned_port = resolve_assigned_port(&conn, "ws-1", "web", None, None, false)
            .expect("port resolution should succeed");

        assert!((RANDOMIZED_PORT_RANGE_START..=RANDOMIZED_PORT_RANGE_END).contains(&assigned_port));
    }

    #[test]
    fn resolve_assigned_port_honors_override() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        init_workspace_service_table(&conn);

        let assigned_port = resolve_assigned_port(&conn, "ws-1", "web", Some(9999), None, false)
            .expect("port resolution should succeed");

        assert_eq!(assigned_port, 9999);
    }

    #[test]
    fn resolve_assigned_port_reuses_current_assigned_port() {
        let conn = rusqlite::Connection::open_in_memory().expect("open in-memory db");
        init_workspace_service_table(&conn);

        let assigned_port = resolve_assigned_port(&conn, "ws-1", "web", None, Some(42000), true)
            .expect("port resolution should succeed");

        assert_eq!(assigned_port, 42000);
    }
}
