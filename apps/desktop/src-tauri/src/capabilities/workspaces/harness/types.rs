use crate::shared::errors::LifecycleError;
use serde_json::Value;

use super::launch_config::HarnessLaunchConfig;

#[derive(Clone, Copy)]
pub(crate) struct HarnessAdapter {
    pub(crate) name: &'static str,
    pub(crate) display_name: &'static str,
    pub(crate) program: &'static str,
    pub(crate) new_session_args:
        fn(Option<&str>, Option<&HarnessLaunchConfig>) -> Result<Vec<String>, LifecycleError>,
    pub(crate) resume_args:
        fn(&str, Option<&HarnessLaunchConfig>) -> Result<Vec<String>, LifecycleError>,
    pub(in crate::capabilities::workspaces::harness) session_store: Option<SessionStoreConfig>,
    pub(in crate::capabilities::workspaces::harness) parse_prompt_submission:
        fn(&Value, &str) -> Option<HarnessPromptSubmission>,
    pub(in crate::capabilities::workspaces::harness) parse_turn_completion:
        fn(&Value, &str) -> Option<HarnessTurnCompletion>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HarnessPromptSubmission {
    pub(crate) prompt_key: String,
    pub(crate) prompt_text: String,
    pub(crate) turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HarnessTurnCompletion {
    pub(crate) completion_key: String,
    pub(crate) turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HarnessSessionCandidate {
    pub(crate) detected_at: std::time::SystemTime,
    pub(crate) session_id: String,
}

#[derive(Clone, Copy)]
pub(in crate::capabilities::workspaces::harness) struct SessionStoreConfig {
    pub(in crate::capabilities::workspaces::harness) root_subdir: &'static str,
    pub(in crate::capabilities::workspaces::harness) scope: SessionStoreScope,
    pub(in crate::capabilities::workspaces::harness) metadata_line_limit: usize,
    pub(in crate::capabilities::workspaces::harness) required_type:
        Option<(&'static [&'static str], &'static str)>,
    pub(in crate::capabilities::workspaces::harness) cwd_path: &'static [&'static str],
    pub(in crate::capabilities::workspaces::harness) session_id_path:
        Option<&'static [&'static str]>,
    pub(in crate::capabilities::workspaces::harness) session_id_from_file_stem: bool,
}

#[derive(Clone, Copy)]
pub(in crate::capabilities::workspaces::harness) enum SessionStoreScope {
    ExactWorkspaceDir {
        workspace_dir_name: fn(&str) -> String,
    },
    Recursive,
}

impl HarnessAdapter {
    pub(crate) fn supports_session_observer(self) -> bool {
        self.session_store.is_some()
    }

    pub(crate) fn parse_prompt_submission(
        self,
        value: &Value,
        line: &str,
    ) -> Option<HarnessPromptSubmission> {
        (self.parse_prompt_submission)(value, line)
    }

    pub(crate) fn parse_turn_completion(
        self,
        value: &Value,
        line: &str,
    ) -> Option<HarnessTurnCompletion> {
        (self.parse_turn_completion)(value, line)
    }
}
