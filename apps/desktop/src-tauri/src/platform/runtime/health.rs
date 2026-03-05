use crate::capabilities::workspaces::manifest::HealthCheck;
use crate::shared::errors::LifecycleError;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

pub async fn check_health(health_check: &HealthCheck) -> bool {
    match health_check {
        HealthCheck::Tcp {
            host,
            port,
            timeout_seconds,
        } => check_tcp(host, *port, *timeout_seconds).await,
        HealthCheck::Http {
            url,
            timeout_seconds,
        } => check_http(url, *timeout_seconds).await,
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

pub async fn wait_for_health(
    health_check: &HealthCheck,
    startup_timeout_seconds: u64,
) -> Result<(), LifecycleError> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(startup_timeout_seconds);
    let poll_interval = Duration::from_secs(1);

    loop {
        if check_health(health_check).await {
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
