use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::hash::{DefaultHasher, Hash, Hasher};

const RANDOMIZED_PORT_RANGE_START: i64 = 41_000;
const RANDOMIZED_PORT_RANGE_END: i64 = 48_999;

fn is_host_port_available(port: i64) -> bool {
    if !(1..=65535).contains(&port) {
        return false;
    }

    std::net::TcpListener::bind(("127.0.0.1", port as u16)).is_ok()
}

fn load_reserved_effective_ports(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
) -> Result<std::collections::HashSet<i64>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT effective_port
             FROM workspace_service
             WHERE effective_port IS NOT NULL
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

pub(crate) fn resolve_effective_port(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
    default_port: Option<i64>,
    port_override: Option<i64>,
    current_effective_port: Option<i64>,
    allow_bound_current_port: bool,
    prefer_randomized_port_assignment: bool,
) -> Result<Option<i64>, LifecycleError> {
    let Some(default_port) = default_port else {
        return Ok(None);
    };

    let reserved_ports = load_reserved_effective_ports(conn, workspace_id, service_name)?;

    let is_port_usable = |candidate: i64| {
        !reserved_ports.contains(&candidate)
            && if current_effective_port == Some(candidate) {
                allow_bound_current_port || is_host_port_available(candidate)
            } else {
                is_host_port_available(candidate)
            }
    };

    if let Some(port_override) = port_override {
        if is_port_usable(port_override) {
            return Ok(Some(port_override));
        }

        return Err(LifecycleError::PortConflict {
            service: service_name.to_string(),
            port: port_override as u16,
        });
    }

    if let Some(current_effective_port) = current_effective_port {
        if is_port_usable(current_effective_port) {
            return Ok(Some(current_effective_port));
        }
    }

    if prefer_randomized_port_assignment {
        if let Some(candidate) =
            resolve_randomized_port(workspace_id, service_name, default_port, &is_port_usable)
        {
            return Ok(Some(candidate));
        }
    }

    for offset in 0..=200_i64 {
        let candidate = default_port + offset;
        if is_port_usable(candidate) {
            return Ok(Some(candidate));
        }
    }

    Err(LifecycleError::PortConflict {
        service: service_name.to_string(),
        port: default_port as u16,
    })
}

fn resolve_randomized_port(
    workspace_id: &str,
    service_name: &str,
    default_port: i64,
    is_port_usable: &dyn Fn(i64) -> bool,
) -> Option<i64> {
    let span = RANDOMIZED_PORT_RANGE_END - RANDOMIZED_PORT_RANGE_START + 1;
    if span <= 0 {
        return None;
    }

    let mut hasher = DefaultHasher::new();
    workspace_id.hash(&mut hasher);
    service_name.hash(&mut hasher);
    default_port.hash(&mut hasher);
    let offset = (hasher.finish() % span as u64) as i64;

    for step in 0..span {
        let candidate = RANDOMIZED_PORT_RANGE_START + ((offset + step) % span);
        if is_port_usable(candidate) {
            return Some(candidate);
        }
    }

    None
}
