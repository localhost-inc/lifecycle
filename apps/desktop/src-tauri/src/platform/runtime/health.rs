use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum HealthCheckPort {
    Number(u16),
    Template(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum HealthCheck {
    #[serde(rename = "tcp")]
    Tcp {
        host: String,
        port: HealthCheckPort,
        timeout_seconds: u64,
    },
    #[serde(rename = "http")]
    Http { url: String, timeout_seconds: u64 },
    #[serde(rename = "container")]
    Container { timeout_seconds: u64 },
}
use bollard::container::InspectContainerOptions;
use bollard::models::HealthStatusEnum;
use bollard::Docker;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

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
            return Err(LifecycleError::HealthcheckFailed {
                name: "unknown".to_string(),
            });
        }

        tokio::time::sleep(poll_interval).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn tcp_health_check_fails_for_unreachable_port() {
        let health_check = HealthCheck::Tcp {
            host: "203.0.113.1".to_string(),
            port: HealthCheckPort::Number(81),
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
