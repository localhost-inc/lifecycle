use crate::capabilities::workspaces::manifest::{HealthCheck, HealthCheckPort};
use crate::platform::runtime::templates::expand_reserved_runtime_templates;
use crate::shared::errors::LifecycleError;
use bollard::container::InspectContainerOptions;
use bollard::models::HealthStatusEnum;
use bollard::Docker;
use std::collections::HashMap;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

pub fn resolve_health_check_templates(
    health_check: &HealthCheck,
    runtime_env: &HashMap<String, String>,
    field: &str,
) -> Result<HealthCheck, LifecycleError> {
    match health_check {
        HealthCheck::Tcp {
            host,
            port,
            timeout_seconds,
        } => Ok(HealthCheck::Tcp {
            host: expand_reserved_runtime_templates(host, runtime_env, &format!("{field}.host"))?,
            port: HealthCheckPort::Number(resolve_tcp_port(
                port,
                runtime_env,
                &format!("{field}.port"),
            )?),
            timeout_seconds: *timeout_seconds,
        }),
        HealthCheck::Http {
            url,
            timeout_seconds,
        } => Ok(HealthCheck::Http {
            url: expand_reserved_runtime_templates(url, runtime_env, &format!("{field}.url"))?,
            timeout_seconds: *timeout_seconds,
        }),
        HealthCheck::Container { timeout_seconds } => Ok(HealthCheck::Container {
            timeout_seconds: *timeout_seconds,
        }),
    }
}

fn resolve_tcp_port(
    port: &HealthCheckPort,
    runtime_env: &HashMap<String, String>,
    field: &str,
) -> Result<u16, LifecycleError> {
    let rendered = match port {
        HealthCheckPort::Number(port) => return Ok(*port),
        HealthCheckPort::Template(value) => {
            expand_reserved_runtime_templates(value, runtime_env, field)?
        }
    };

    rendered
        .parse::<u16>()
        .map_err(|_| LifecycleError::InvalidInput {
            field: field.to_string(),
            reason: format!("'{rendered}' is not a valid TCP port"),
        })
}

pub async fn check_health(health_check: &HealthCheck, container_ref: Option<&str>) -> bool {
    match health_check {
        HealthCheck::Tcp {
            host,
            port,
            timeout_seconds,
        } => match port {
            HealthCheckPort::Number(port) => check_tcp(host, *port, *timeout_seconds).await,
            HealthCheckPort::Template(_) => false,
        },
        HealthCheck::Http {
            url,
            timeout_seconds,
        } => check_http(url, *timeout_seconds).await,
        HealthCheck::Container { timeout_seconds } => {
            let Some(container_ref) = container_ref else {
                return false;
            };
            check_container(container_ref, *timeout_seconds).await
        }
    }
}

async fn check_tcp(host: &str, port: u16, timeout_seconds: u64) -> bool {
    let addr = format!("{}:{}", host, port);
    timeout(
        Duration::from_secs(timeout_seconds),
        TcpStream::connect(&addr),
    )
    .await
    .map(|r| r.is_ok())
    .unwrap_or(false)
}

async fn check_http(url: &str, timeout_seconds: u64) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build();

    let client = match client {
        Ok(c) => c,
        Err(_) => return false,
    };

    client
        .get(url)
        .send()
        .await
        .map(|resp| resp.status().is_success())
        .unwrap_or(false)
}

async fn check_container(container_ref: &str, timeout_seconds: u64) -> bool {
    let Ok(docker) = Docker::connect_with_local_defaults() else {
        return false;
    };
    let inspect_result = timeout(
        Duration::from_secs(timeout_seconds),
        docker.inspect_container(container_ref, None::<InspectContainerOptions>),
    )
    .await;
    let Ok(Ok(container)) = inspect_result else {
        return false;
    };
    let Some(state) = container.state else {
        return false;
    };
    if state.running != Some(true) {
        return false;
    }

    matches!(
        state.health.and_then(|health| health.status),
        Some(HealthStatusEnum::HEALTHY)
    )
}

pub async fn wait_for_health(
    health_check: &HealthCheck,
    startup_timeout_seconds: u64,
    container_ref: Option<&str>,
) -> Result<(), LifecycleError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(startup_timeout_seconds);
    let poll_interval = Duration::from_secs(1);

    loop {
        if check_health(health_check, container_ref).await {
            return Ok(());
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(LifecycleError::ServiceHealthcheckFailed {
                service: "unknown".to_string(),
            });
        }

        tokio::time::sleep(poll_interval).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_http_health_check_url_templates() {
        let runtime_env = HashMap::from([(
            "LIFECYCLE_SERVICE_WEB_ADDRESS".to_string(),
            "127.0.0.1:43085".to_string(),
        )]);
        let health_check = HealthCheck::Http {
            url: "http://${LIFECYCLE_SERVICE_WEB_ADDRESS}/@vite/client".to_string(),
            timeout_seconds: 5,
        };

        let resolved = resolve_health_check_templates(
            &health_check,
            &runtime_env,
            "environment.web.health_check",
        )
        .expect("http health check templates should resolve");

        match resolved {
            HealthCheck::Http {
                url,
                timeout_seconds,
            } => {
                assert_eq!(url, "http://127.0.0.1:43085/@vite/client");
                assert_eq!(timeout_seconds, 5);
            }
            other => panic!("unexpected health check: {other:?}"),
        }
    }

    #[test]
    fn expands_tcp_health_check_port_templates() {
        let runtime_env = HashMap::from([
            (
                "LIFECYCLE_SERVICE_REDIS_HOST".to_string(),
                "127.0.0.1".to_string(),
            ),
            (
                "LIFECYCLE_SERVICE_REDIS_PORT".to_string(),
                "47070".to_string(),
            ),
        ]);
        let health_check = HealthCheck::Tcp {
            host: "${LIFECYCLE_SERVICE_REDIS_HOST}".to_string(),
            port: HealthCheckPort::Template("${LIFECYCLE_SERVICE_REDIS_PORT}".to_string()),
            timeout_seconds: 5,
        };

        let resolved = resolve_health_check_templates(
            &health_check,
            &runtime_env,
            "environment.redis.health_check",
        )
        .expect("tcp health check templates should resolve");

        match resolved {
            HealthCheck::Tcp {
                host,
                port,
                timeout_seconds,
            } => {
                assert_eq!(host, "127.0.0.1");
                assert!(matches!(port, HealthCheckPort::Number(47070)));
                assert_eq!(timeout_seconds, 5);
            }
            other => panic!("unexpected health check: {other:?}"),
        }
    }

    #[test]
    fn rejects_unknown_health_check_templates() {
        let health_check = HealthCheck::Http {
            url: "http://${LIFECYCLE_SERVICE_WEB_ADDRESS}/@vite/client".to_string(),
            timeout_seconds: 5,
        };

        let error = resolve_health_check_templates(
            &health_check,
            &HashMap::new(),
            "environment.web.health_check",
        )
        .expect_err("unknown runtime variables should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "environment.web.health_check.url");
                assert!(reason.contains("unknown runtime variable"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[tokio::test]
    async fn tcp_health_check_fails_for_unreachable_port() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().expect("read local addr").port();
        drop(listener);

        let health_check = HealthCheck::Tcp {
            host: "127.0.0.1".to_string(),
            port: HealthCheckPort::Number(port),
            timeout_seconds: 1,
        };

        assert!(!check_health(&health_check, None).await);
    }

    #[tokio::test]
    async fn container_health_check_requires_container_context() {
        let health_check = HealthCheck::Container { timeout_seconds: 1 };
        assert!(!check_health(&health_check, None).await);
    }
}
