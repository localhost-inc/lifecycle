use crate::shared::errors::{LifecycleError, WorkspaceStatus};

pub fn validate_workspace_transition(
    from: &WorkspaceStatus,
    to: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (from, to),
        // idle -> starting
        (WorkspaceStatus::Idle, WorkspaceStatus::Starting)
            // starting -> active | stopping | idle
            | (WorkspaceStatus::Starting, WorkspaceStatus::Active)
            | (WorkspaceStatus::Starting, WorkspaceStatus::Stopping)
            | (WorkspaceStatus::Starting, WorkspaceStatus::Idle)
            // active -> starting | stopping
            | (WorkspaceStatus::Active, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Active, WorkspaceStatus::Stopping)
            // stopping -> idle
            | (WorkspaceStatus::Stopping, WorkspaceStatus::Idle)
    );

    if allowed {
        Ok(())
    } else {
        Err(LifecycleError::InvalidStateTransition {
            from: from.to_string(),
            to: to.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions() {
        let cases = vec![
            (WorkspaceStatus::Idle, WorkspaceStatus::Starting),
            (WorkspaceStatus::Starting, WorkspaceStatus::Active),
            (WorkspaceStatus::Starting, WorkspaceStatus::Stopping),
            (WorkspaceStatus::Starting, WorkspaceStatus::Idle),
            (WorkspaceStatus::Active, WorkspaceStatus::Starting),
            (WorkspaceStatus::Active, WorkspaceStatus::Stopping),
            (WorkspaceStatus::Stopping, WorkspaceStatus::Idle),
        ];

        for (from, to) in cases {
            assert!(
                validate_workspace_transition(&from, &to).is_ok(),
                "Expected {from} -> {to} to be valid"
            );
        }
    }

    #[test]
    fn invalid_transitions() {
        let cases = vec![
            (WorkspaceStatus::Idle, WorkspaceStatus::Active),
            (WorkspaceStatus::Idle, WorkspaceStatus::Stopping),
            (WorkspaceStatus::Starting, WorkspaceStatus::Starting),
            (WorkspaceStatus::Active, WorkspaceStatus::Active),
            (WorkspaceStatus::Stopping, WorkspaceStatus::Starting),
            (WorkspaceStatus::Stopping, WorkspaceStatus::Active),
        ];

        for (from, to) in cases {
            assert!(
                validate_workspace_transition(&from, &to).is_err(),
                "Expected {from} -> {to} to be invalid"
            );
        }
    }
}
