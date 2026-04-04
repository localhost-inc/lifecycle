pub mod render;

use crate::bridge::LifecycleBridgeClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnvTab {
    Services,
    Logs,
}

impl EnvTab {
    pub const ALL: &'static [EnvTab] = &[EnvTab::Services, EnvTab::Logs];

    pub fn label(self) -> &'static str {
        match self {
            Self::Services => "Services",
            Self::Logs => "Logs",
        }
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ServiceEntry {
    pub name: String,
    pub status: String,
    pub port: Option<u16>,
    pub preview_url: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct LogLine {
    pub service: String,
    pub text: String,
    pub timestamp: String,
    pub is_error: bool,
}

pub struct EnvironmentPanel {
    pub collapsed: bool,
    pub active_tab: EnvTab,
    pub services: Vec<ServiceEntry>,
    pub logs: Vec<LogLine>,
    pub scroll: u16,
}

impl EnvironmentPanel {
    pub fn new() -> Self {
        Self {
            collapsed: false,
            active_tab: EnvTab::Services,
            services: vec![],
            logs: vec![],
            scroll: 0,
        }
    }

    pub fn toggle_collapsed(&mut self) {
        self.collapsed = !self.collapsed;
    }

    pub fn scroll_up(&mut self) {
        self.scroll = self.scroll.saturating_sub(1);
    }

    pub fn scroll_down(&mut self) {
        self.scroll = self.scroll.saturating_add(1);
    }

    pub fn next_tab(&mut self) {
        let tabs = EnvTab::ALL;
        let idx = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(idx + 1) % tabs.len()];
    }

    pub fn prev_tab(&mut self) {
        let tabs = EnvTab::ALL;
        let idx = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(idx + tabs.len() - 1) % tabs.len()];
    }

    /// Refresh services from the bridge.
    pub fn refresh(&mut self, workspace_id: Option<&str>) {
        let Some(ws_id) = workspace_id else {
            self.services.clear();
            return;
        };

        if let Some(bridge) = LifecycleBridgeClient::from_env() {
            if let Ok(parsed) = bridge.service_list(ws_id) {
                self.services = parsed.services.into_iter().map(|s| ServiceEntry {
                    name: s.name,
                    status: s.status,
                    port: s.assigned_port,
                    preview_url: s.preview_url,
                }).collect();
            }
        }
    }
}
