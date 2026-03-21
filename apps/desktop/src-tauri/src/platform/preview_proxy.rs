use crate::platform::db::open_db;
use crate::platform::git::worktree::{short_workspace_id, slugify_workspace_name};
use crate::shared::errors::LifecycleError;
use axum::body::Body;
use axum::extract::State;
use axum::http::header::{HeaderName, HOST};
use axum::http::{Request, Response, StatusCode};
use axum::routing::any;
use axum::Router;
use futures_util::TryStreamExt;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, Ipv6Addr, TcpListener as StdTcpListener};
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use tokio::net::TcpListener as AsyncTcpListener;

const DEFAULT_PREVIEW_PROXY_PORT: u16 = 52_300;
const PREVIEW_PROXY_PORT_RANGE_END: u16 = 52_332;
const PREVIEW_PROXY_PORT_FILE_NAME: &str = "preview-proxy-port";
const PREVIEW_HOST_SUFFIX: [&str; 2] = ["lifecycle", "localhost"];

static PREVIEW_PROXY_PORT: AtomicU16 = AtomicU16::new(DEFAULT_PREVIEW_PROXY_PORT);

#[derive(Clone)]
struct PreviewProxyState {
    client: reqwest::Client,
    db_path: String,
}

#[derive(Debug, PartialEq, Eq)]
struct PreviewRoute {
    service_label: String,
    workspace_label: String,
}

#[derive(Debug)]
struct PreviewTarget {
    assigned_port: Option<i64>,
    service_status: String,
}

pub(crate) fn current_preview_proxy_port() -> u16 {
    PREVIEW_PROXY_PORT.load(Ordering::Relaxed)
}

fn set_preview_proxy_port(port: u16) {
    PREVIEW_PROXY_PORT.store(port, Ordering::Relaxed);
}

pub(crate) fn service_url(workspace_label: &str, name: &str) -> String {
    format!(
        "http://{}:{}",
        preview_host(workspace_label, name),
        current_preview_proxy_port()
    )
}

pub(crate) fn local_preview_url(workspace_label: &str, name: &str) -> String {
    service_url(workspace_label, name)
}

pub(crate) fn start_preview_proxy(
    app_data_dir: &Path,
    db_path: String,
) -> Result<u16, LifecycleError> {
    let (listeners, port) = bind_preview_listeners(app_data_dir)?;
    set_preview_proxy_port(port);

    let state = PreviewProxyState {
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| {
                LifecycleError::Io(format!("failed to build preview proxy client: {error}"))
            })?,
        db_path,
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
            )))
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
            )))
        }
    }

    Ok(Some(listeners))
}

async fn proxy_request(
    State(state): State<PreviewProxyState>,
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

    let Some(route) = parse_preview_host(&host) else {
        return plain_response(StatusCode::BAD_REQUEST, "invalid preview host");
    };

    let target = match load_preview_target(&state.db_path, &route).await {
        Ok(Some(target)) => target,
        Ok(None) => return plain_response(StatusCode::NOT_FOUND, "unknown preview route"),
        Err(error) => {
            return plain_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("failed to resolve preview route: {error}"),
            )
        }
    };

    if target.service_status != "ready" {
        return plain_response(
            StatusCode::SERVICE_UNAVAILABLE,
            &format!("service is {}", target.service_status),
        );
    }

    let Some(assigned_port) = target.assigned_port else {
        return plain_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "preview target has no active port",
        );
    };

    let path_and_query = request
        .uri()
        .path_and_query()
        .map(|value| value.as_str())
        .unwrap_or("/");
    let target_url = format!("http://127.0.0.1:{assigned_port}{path_and_query}");
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
                &format!("failed to reach preview target: {error}"),
            )
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
                &format!("failed to build preview response: {error}"),
            )
        })
}

async fn load_preview_target(
    db_path: &str,
    route: &PreviewRoute,
) -> Result<Option<PreviewTarget>, LifecycleError> {
    let db_path = db_path.to_string();
    let route = PreviewRoute {
        service_label: route.service_label.clone(),
        workspace_label: route.workspace_label.clone(),
    };

    tokio::task::spawn_blocking(move || {
        let conn = open_db(&db_path)?;
        let mut stmt = conn
            .prepare(
                "SELECT ws.assigned_port, ws.status, ws.name, w.id, w.checkout_type, w.name, w.source_ref
                 FROM service ws
                 INNER JOIN workspace w ON w.id = ws.workspace_id",
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                ))
            })
            .map_err(|error| LifecycleError::Database(error.to_string()))?;

        for row in rows {
            let (
                assigned_port,
                service_status,
                name,
                workspace_id,
                checkout_type,
                workspace_name,
                source_ref,
            ) = row.map_err(|error| LifecycleError::Database(error.to_string()))?;
            if service_host_label(&name) != route.service_label {
                continue;
            }

            let workspace_label =
                workspace_host_label(&workspace_id, &checkout_type, &workspace_name, &source_ref);
            if workspace_label != route.workspace_label {
                continue;
            }

            return Ok(Some(PreviewTarget {
                assigned_port,
                service_status,
            }));
        }

        Ok(None)
    })
    .await
    .map_err(|error| LifecycleError::Io(format!("preview proxy task failed: {error}")))?
}

pub(crate) fn workspace_host_label(
    workspace_id: &str,
    checkout_type: &str,
    name: &str,
    source_ref: &str,
) -> String {
    let short_id = short_workspace_id(workspace_id);
    let base = preferred_workspace_host_base(checkout_type, name, source_ref, &short_id);
    if base.ends_with(&format!("-{short_id}")) {
        base
    } else {
        format!("{base}-{short_id}")
    }
}

fn preferred_workspace_host_base(
    checkout_type: &str,
    name: &str,
    source_ref: &str,
    short_id: &str,
) -> String {
    if checkout_type == "worktree" {
        if let Some(slug) = lifecycle_worktree_branch_slug(source_ref, short_id) {
            return slug;
        }
    }

    let source_slug = slugify_source_ref(source_ref);
    if source_slug != "workspace" {
        return source_slug;
    }

    slugify_workspace_name(name)
}

fn lifecycle_worktree_branch_slug(source_ref: &str, short_id: &str) -> Option<String> {
    let branch_slug = source_ref.trim().strip_prefix("lifecycle/")?;
    let branch_slug = branch_slug.strip_suffix(&format!("-{short_id}"))?;
    let slug = slugify_workspace_name(branch_slug);
    if slug == "workspace" {
        None
    } else {
        Some(slug)
    }
}

fn slugify_source_ref(source_ref: &str) -> String {
    let trimmed = source_ref.trim();
    if trimmed.is_empty() || trimmed == "HEAD" {
        return "workspace".to_string();
    }

    let normalized = trimmed
        .strip_prefix("refs/heads/")
        .or_else(|| trimmed.strip_prefix("refs/remotes/origin/"))
        .or_else(|| trimmed.strip_prefix("origin/"))
        .unwrap_or(trimmed);

    slugify_workspace_name(normalized)
}

fn service_host_label(name: &str) -> String {
    slugify_workspace_name(name)
}

fn preview_host(workspace_label: &str, name: &str) -> String {
    [
        service_host_label(name),
        workspace_label.to_string(),
        PREVIEW_HOST_SUFFIX[0].to_string(),
        PREVIEW_HOST_SUFFIX[1].to_string(),
    ]
    .join(".")
}

fn parse_preview_host(host: &str) -> Option<PreviewRoute> {
    let hostname = host_without_port(host);
    let labels = hostname.split('.').collect::<Vec<_>>();
    if labels.len() != 4
        || labels[2] != PREVIEW_HOST_SUFFIX[0]
        || labels[3] != PREVIEW_HOST_SUFFIX[1]
    {
        return None;
    }

    if labels[0].is_empty() || labels[1].is_empty() {
        return None;
    }

    Some(PreviewRoute {
        service_label: labels[0].to_string(),
        workspace_label: labels[1].to_string(),
    })
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
        .expect("plain preview proxy response should build")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;
    use rusqlite::params;
    use std::time::Duration;

    #[test]
    fn preview_host_round_trips_readable_route_labels() {
        let workspace_label = workspace_host_label(
            "123e4567-e89b-12d3-a456-426614174000",
            "worktree",
            "Fix auth callback",
            "lifecycle/fix-auth-callback-123e4567",
        );
        let host = preview_host(&workspace_label, "www-preview_service");
        let route = parse_preview_host(&format!("{host}:{}", current_preview_proxy_port()))
            .expect("host should parse");

        assert_eq!(route.workspace_label, "fix-auth-callback-123e4567");
        assert_eq!(route.service_label, "www-preview-service");
    }

    #[test]
    fn workspace_host_label_uses_branch_for_root_workspaces() {
        assert_eq!(
            workspace_host_label(
                "workspace_root",
                "root",
                "Lifecycle",
                "feature/preview-hosts"
            ),
            "feature-preview-hosts-workspac"
        );
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
    async fn proxy_request_forwards_ready_service_traffic_for_ready_services() {
        let db_path = std::env::temp_dir().join(format!(
            "lifecycle-preview-proxy-{}.db",
            uuid::Uuid::new_v4()
        ));
        let db_path_str = db_path.to_string_lossy().to_string();
        let conn = open_db(&db_path_str).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT NOT NULL,
                checkout_type TEXT NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL
            );
            CREATE TABLE service (
                workspace_id TEXT NOT NULL,
                name TEXT NOT NULL,
                assigned_port INTEGER,
                status TEXT NOT NULL
            );",
        )
        .expect("create workspace tables");
        conn.execute(
            "INSERT INTO workspace (id, checkout_type, name, source_ref) VALUES (?1, ?2, ?3, ?4)",
            params![
                "ws_test",
                "worktree",
                "Frost beacon",
                "lifecycle/frost-beacon-ws-test"
            ],
        )
        .expect("insert workspace");
        drop(conn);

        let upstream = AsyncTcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind upstream listener");
        let upstream_port = upstream.local_addr().expect("upstream local addr").port();
        let upstream_router =
            Router::new().fallback(any(|| async { "proxied ok".into_response() }));
        let upstream_task = tokio::spawn(async move {
            axum::serve(upstream, upstream_router)
                .await
                .expect("serve upstream");
        });

        let conn = open_db(&db_path_str).expect("re-open db");
        conn.execute(
            "INSERT INTO service (workspace_id, name, assigned_port, status)
             VALUES (?1, ?2, ?3, 'ready')",
            params!["ws_test", "www", i64::from(upstream_port)],
        )
        .expect("insert service");
        drop(conn);

        let proxy = AsyncTcpListener::bind((Ipv4Addr::LOCALHOST, 0))
            .await
            .expect("bind proxy listener");
        let proxy_port = proxy.local_addr().expect("proxy local addr").port();
        let state = PreviewProxyState {
            client: reqwest::Client::new(),
            db_path: db_path_str.clone(),
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
            .header(
                HOST,
                preview_host(
                    &workspace_host_label(
                        "ws_test",
                        "worktree",
                        "Frost beacon",
                        "lifecycle/frost-beacon-ws-test",
                    ),
                    "www",
                ),
            )
            .send()
            .await
            .expect("request through proxy");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.text().await.expect("proxy response body"),
            "proxied ok"
        );

        upstream_task.abort();
        proxy_task.abort();
        let _ = std::fs::remove_file(db_path);
    }
}
