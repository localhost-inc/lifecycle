use crate::shared::errors::LifecycleError;
use axum::body::Body;
use axum::extract::State;
use axum::http::header::{HeaderName, HOST};
use axum::http::{Request, Response, StatusCode};
use axum::routing::any;
use axum::Router;
use futures_util::TryStreamExt;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener as StdTcpListener};
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{LazyLock, RwLock};
use tokio::net::TcpListener as AsyncTcpListener;

const DEFAULT_PREVIEW_PROXY_PORT: u16 = 52_300;
const PREVIEW_PROXY_PORT_RANGE_END: u16 = 52_332;
const PREVIEW_PROXY_PORT_FILE_NAME: &str = "preview-proxy-port";
const PROXY_HOST_SUFFIX: [&str; 2] = ["lifecycle", "localhost"];

static PREVIEW_PROXY_PORT: AtomicU16 = AtomicU16::new(DEFAULT_PREVIEW_PROXY_PORT);
static PROXY_REGISTRY: LazyLock<ProxyRegistry> = LazyLock::new(ProxyRegistry::default);

#[derive(Clone)]
struct ProxyState {
    client: reqwest::Client,
}

/// A registered proxy target. The host pattern is `{label_a}.{label_b}.lifecycle.localhost`.
#[derive(Debug, Clone)]
struct ProxyTarget {
    port: u16,
}

/// Flat routing table: `(label_a, label_b)` → target port.
#[derive(Debug, Default)]
struct ProxyRegistry {
    targets: RwLock<HashMap<String, ProxyTarget>>,
}

impl ProxyRegistry {
    fn register(&self, id: &str, port: u16) {
        self.targets
            .write()
            .expect("proxy registry lock poisoned")
            .insert(id.to_string(), ProxyTarget { port });
    }

    fn remove(&self, id: &str) -> bool {
        self.targets
            .write()
            .expect("proxy registry lock poisoned")
            .remove(id)
            .is_some()
    }

    fn find(&self, label_a: &str, label_b: &str) -> Option<u16> {
        let targets = self
            .targets
            .read()
            .expect("proxy registry lock poisoned");

        // Try exact composite key first: "{label_a}.{label_b}"
        let key = format!("{label_a}.{label_b}");
        if let Some(target) = targets.get(&key) {
            return Some(target.port);
        }

        None
    }
}

pub(crate) fn current_preview_proxy_port() -> u16 {
    PREVIEW_PROXY_PORT.load(Ordering::Relaxed)
}

fn set_preview_proxy_port(port: u16) {
    PREVIEW_PROXY_PORT.store(port, Ordering::Relaxed);
}

/// Register a proxy route. The `id` is the lookup key (e.g. `"api.my-project-abc12345"`).
/// Requests to `{id}.lifecycle.localhost:{port}` will be forwarded to `127.0.0.1:{target_port}`.
pub(crate) fn register_proxy_target(id: &str, target_port: u16) {
    PROXY_REGISTRY.register(id, target_port);
}

/// Remove a proxy route by ID.
pub(crate) fn remove_proxy_target(id: &str) -> bool {
    PROXY_REGISTRY.remove(id)
}

pub(crate) fn start_preview_proxy(app_data_dir: &Path) -> Result<u16, LifecycleError> {
    let (listeners, port) = bind_preview_listeners(app_data_dir)?;
    set_preview_proxy_port(port);

    let state = ProxyState {
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| {
                LifecycleError::Io(format!("failed to build preview proxy client: {error}"))
            })?,
    };
    let router = Router::new().fallback(any(proxy_request)).with_state(state);

    for listener in listeners {
        let app = router.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match AsyncTcpListener::from_std(listener) {
                Ok(listener) => listener,
                Err(error) => {
                    crate::platform::diagnostics::append_error(
                        "preview-proxy-server",
                        LifecycleError::Io(format!(
                            "failed to adopt preview proxy listener: {error}"
                        )),
                    );
                    return;
                }
            };
            if let Err(error) = axum::serve(listener, app).await {
                crate::platform::diagnostics::append_error(
                    "preview-proxy-server",
                    LifecycleError::Io(format!("preview proxy server failed: {error}")),
                );
            }
        });
    }

    Ok(port)
}

fn bind_preview_listeners(
    app_data_dir: &Path,
) -> Result<(Vec<StdTcpListener>, u16), LifecycleError> {
    let port_file = app_data_dir.join(PREVIEW_PROXY_PORT_FILE_NAME);
    let saved_port = read_saved_port(&port_file);
    let mut candidates = Vec::new();

    if let Some(port) = saved_port {
        candidates.push(port);
    }

    for port in DEFAULT_PREVIEW_PROXY_PORT..=PREVIEW_PROXY_PORT_RANGE_END {
        if Some(port) != saved_port {
            candidates.push(port);
        }
    }

    for port in candidates {
        if let Some(listeners) = try_bind_preview_port(port)? {
            std::fs::write(&port_file, port.to_string()).map_err(|error| {
                LifecycleError::Io(format!(
                    "failed to persist preview proxy port '{}': {error}",
                    port_file.display()
                ))
            })?;
            return Ok((listeners, port));
        }
    }

    Err(LifecycleError::Io(
        "failed to bind a local preview proxy port".to_string(),
    ))
}

fn read_saved_port(path: &Path) -> Option<u16> {
    let contents = std::fs::read_to_string(path).ok()?;
    contents.trim().parse().ok()
}

fn try_bind_preview_port(port: u16) -> Result<Option<Vec<StdTcpListener>>, LifecycleError> {
    let mut listeners = Vec::new();
    let ipv4 = match StdTcpListener::bind((Ipv4Addr::LOCALHOST, port)) {
        Ok(listener) => listener,
        Err(error) if matches!(error.kind(), ErrorKind::AddrInUse) => return Ok(None),
        Err(error) => {
            return Err(LifecycleError::Io(format!(
                "failed to bind preview proxy IPv4 listener on port {port}: {error}"
            )));
        }
    };
    ipv4.set_nonblocking(true).map_err(|error| {
        LifecycleError::Io(format!(
            "failed to configure preview proxy IPv4 listener on port {port}: {error}"
        ))
    })?;
    listeners.push(ipv4);

    match StdTcpListener::bind((Ipv6Addr::LOCALHOST, port)) {
        Ok(listener) => {
            listener.set_nonblocking(true).map_err(|error| {
                LifecycleError::Io(format!(
                    "failed to configure preview proxy IPv6 listener on port {port}: {error}"
                ))
            })?;
            listeners.push(listener);
        }
        Err(error) if matches!(error.kind(), ErrorKind::AddrNotAvailable) => {}
        Err(error) if matches!(error.kind(), ErrorKind::AddrInUse) => return Ok(None),
        Err(error) => {
            return Err(LifecycleError::Io(format!(
                "failed to bind preview proxy IPv6 listener on port {port}: {error}"
            )));
        }
    }

    Ok(Some(listeners))
}

async fn proxy_request(
    State(state): State<ProxyState>,
    request: Request<Body>,
) -> Response<Body> {
    let host = request
        .headers()
        .get(HOST)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let Some(host) = host else {
        return plain_response(StatusCode::BAD_REQUEST, "missing Host header");
    };

    let Some((label_a, label_b)) = parse_proxy_host(&host) else {
        return plain_response(StatusCode::BAD_REQUEST, "invalid proxy host");
    };

    let Some(target_port) = PROXY_REGISTRY.find(&label_a, &label_b) else {
        return plain_response(StatusCode::NOT_FOUND, "unknown proxy route");
    };

    let path_and_query = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let target_url = format!("http://127.0.0.1:{target_port}{path_and_query}");
    let (parts, body) = request.into_parts();
    let mut upstream_request = state.client.request(parts.method.clone(), target_url);

    for (name, value) in &parts.headers {
        if name != HOST && !is_hop_by_hop_header(name) {
            upstream_request = upstream_request.header(name, value);
        }
    }

    upstream_request = upstream_request
        .header("x-forwarded-host", host_without_port(&host))
        .header("x-forwarded-proto", "http");

    let upstream = match upstream_request
        .body(reqwest::Body::wrap_stream(body.into_data_stream()))
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) => {
            return plain_response(
                StatusCode::BAD_GATEWAY,
                &format!("failed to reach target: {error}"),
            );
        }
    };

    let status = upstream.status();
    let headers = upstream.headers().clone();
    let mut response = Response::builder().status(status);
    for (name, value) in &headers {
        if !is_hop_by_hop_header(name) {
            response = response.header(name, value);
        }
    }

    response
        .body(Body::from_stream(upstream.bytes_stream().map_err(
            |error| std::io::Error::new(ErrorKind::Other, error),
        )))
        .unwrap_or_else(|error| {
            plain_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("failed to build response: {error}"),
            )
        })
}

/// Parse `{label_a}.{label_b}.lifecycle.localhost` from a Host header.
fn parse_proxy_host(host: &str) -> Option<(String, String)> {
    let hostname = host_without_port(host);
    let labels = hostname.split('.').collect::<Vec<_>>();
    if labels.len() != 4
        || labels[2] != PROXY_HOST_SUFFIX[0]
        || labels[3] != PROXY_HOST_SUFFIX[1]
    {
        return None;
    }

    if labels[0].is_empty() || labels[1].is_empty() {
        return None;
    }

    Some((labels[0].to_string(), labels[1].to_string()))
}

fn host_without_port(host: &str) -> &str {
    host.split(':').next().unwrap_or(host).trim_end_matches('.')
}

fn is_hop_by_hop_header(name: &HeaderName) -> bool {
    matches!(
        name.as_str().to_ascii_lowercase().as_str(),
        "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "proxy-connection"
    )
}

fn plain_response(status: StatusCode, message: &str) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Body::from(format!("{message}\n")))
        .expect("plain proxy response should build")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;
    use std::time::Duration;

    #[test]
    fn parse_proxy_host_extracts_two_labels() {
        let result = parse_proxy_host("api.my-project.lifecycle.localhost:52300");
        assert_eq!(result, Some(("api".to_string(), "my-project".to_string())));
    }

    #[test]
    fn parse_proxy_host_rejects_wrong_suffix() {
        assert_eq!(parse_proxy_host("api.my-project.example.com"), None);
    }

    #[test]
    fn bind_preview_listeners_succeeds_without_a_tokio_runtime() {
        let app_data_dir =
            std::env::temp_dir().join(format!("lifecycle-preview-proxy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&app_data_dir).expect("create app data dir");

        let (listeners, port) =
            bind_preview_listeners(&app_data_dir).expect("bind preview listeners");

        assert!(!listeners.is_empty());
        assert!((DEFAULT_PREVIEW_PROXY_PORT..=PREVIEW_PROXY_PORT_RANGE_END).contains(&port));

        drop(listeners);
        let _ = std::fs::remove_dir_all(&app_data_dir);
    }

    #[tokio::test]
    async fn proxy_forwards_traffic_to_registered_target() {
        // Start an upstream server.
        let upstream = AsyncTcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind upstream");
        let upstream_port = upstream.local_addr().expect("upstream addr").port();
        let upstream_router =
            Router::new().fallback(any(|| async { "proxied ok".into_response() }));
        let upstream_task = tokio::spawn(async move {
            axum::serve(upstream, upstream_router).await.expect("serve upstream");
        });

        // Register a route.
        register_proxy_target("www.my-project", upstream_port);

        // Start the proxy.
        let proxy = AsyncTcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind proxy");
        let proxy_port = proxy.local_addr().expect("proxy addr").port();
        let state = ProxyState {
            client: reqwest::Client::new(),
        };
        let proxy_task = tokio::spawn(async move {
            axum::serve(
                proxy,
                Router::new().fallback(any(proxy_request)).with_state(state),
            )
            .await
            .expect("serve proxy");
        });

        tokio::time::sleep(Duration::from_millis(50)).await;

        let response = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{proxy_port}/health"))
            .header(HOST, "www.my-project.lifecycle.localhost")
            .send()
            .await
            .expect("request through proxy");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.text().await.expect("body"), "proxied ok");

        // Cleanup.
        remove_proxy_target("www.my-project");
        upstream_task.abort();
        proxy_task.abort();
    }
}
