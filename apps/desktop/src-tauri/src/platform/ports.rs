use crate::shared::errors::LifecycleError;
use std::collections::HashSet;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::net::{Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};

const RANDOMIZED_PORT_RANGE_START: i64 = 41_000;
const RANDOMIZED_PORT_RANGE_END: i64 = 48_999;
const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(50);

pub struct PortState {
    pub assigned_port: Option<i64>,
    pub name: String,
    pub status: String,
}

fn is_addr_available(addr: SocketAddr) -> bool {
    if TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).is_ok() {
        return false;
    }

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

fn resolve_port(
    seed_id: &str,
    name: &str,
    current_assigned_port: Option<i64>,
    allow_bound_current_port: bool,
    reserved_ports: &HashSet<i64>,
) -> Result<i64, LifecycleError> {
    let is_port_usable = |candidate: i64| {
        !reserved_ports.contains(&candidate)
            && if current_assigned_port == Some(candidate) {
                allow_bound_current_port || is_host_port_available(candidate)
            } else {
                is_host_port_available(candidate)
            }
    };

    if let Some(current) = current_assigned_port {
        if is_port_usable(current) {
            return Ok(current);
        }
    }

    let span = RANDOMIZED_PORT_RANGE_END - RANDOMIZED_PORT_RANGE_START + 1;
    if span <= 0 {
        return Err(LifecycleError::PortExhausted {
            name: name.to_string(),
        });
    }

    let mut hasher = DefaultHasher::new();
    seed_id.hash(&mut hasher);
    name.hash(&mut hasher);
    let offset = (hasher.finish() % span as u64) as i64;

    for step in 0..span {
        let candidate = RANDOMIZED_PORT_RANGE_START + ((offset + step) % span);
        if is_port_usable(candidate) {
            return Ok(candidate);
        }
    }

    Err(LifecycleError::PortExhausted {
        name: name.to_string(),
    })
}

pub fn assign_ports(
    seed_id: &str,
    names: &[String],
    entries: &[PortState],
) -> Result<std::collections::HashMap<String, i64>, LifecycleError> {
    if names.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let entries_by_name = entries
        .iter()
        .map(|entry| (entry.name.as_str(), entry))
        .collect::<std::collections::HashMap<_, _>>();
    let mut assigned_ports = std::collections::HashMap::new();
    let mut reserved_ports = entries
        .iter()
        .filter_map(|entry| entry.assigned_port)
        .collect::<HashSet<_>>();

    for name in names {
        let current = entries_by_name.get(name.as_str()).ok_or_else(|| {
            LifecycleError::InvalidInput {
                field: "entries".to_string(),
                reason: format!("'{name}' is missing runtime state"),
            }
        })?;
        if let Some(current_assigned_port) = current.assigned_port {
            reserved_ports.remove(&current_assigned_port);
        }

        let assigned_port = resolve_port(
            seed_id,
            name,
            current.assigned_port,
            matches!(current.status.as_str(), "ready" | "starting"),
            &reserved_ports,
        )?;
        assigned_ports.insert(name.clone(), assigned_port);
        reserved_ports.insert(assigned_port);
    }

    Ok(assigned_ports)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assigns_port_for_new_entry() {
        let ports = assign_ports(
            "seed_1",
            &["web".to_string()],
            &[PortState {
                assigned_port: None,
                name: "web".to_string(),
                status: "stopped".to_string(),
            }],
        )
        .expect("assign ports");

        let port = ports.get("web").expect("web port assigned");
        assert!((RANDOMIZED_PORT_RANGE_START..=RANDOMIZED_PORT_RANGE_END).contains(port));
    }

    #[test]
    fn picks_new_port_when_current_is_occupied() {
        let guard = TcpListener::bind(("127.0.0.1", 0)).expect("bind port");
        let occupied = i64::from(guard.local_addr().expect("local addr").port());

        let ports = assign_ports(
            "seed_1",
            &["api".to_string()],
            &[PortState {
                assigned_port: Some(occupied),
                name: "api".to_string(),
                status: "stopped".to_string(),
            }],
        )
        .expect("assign ports");

        assert!(matches!(ports.get("api"), Some(port) if *port != occupied));
        drop(guard);
    }
}
