use crate::shared::errors::{LifecycleError, WorkspaceStatus};

pub fn validate_workspace_transition(
    from: &WorkspaceStatus,
    to: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (from, to),
        (WorkspaceStatus::Provisioning, WorkspaceStatus::Active)
            | (WorkspaceStatus::Provisioning, WorkspaceStatus::Archiving)
            | (WorkspaceStatus::Active, WorkspaceStatus::Archiving)
            | (WorkspaceStatus::Archiving, WorkspaceStatus::Archived)
            | (WorkspaceStatus::Failed, WorkspaceStatus::Provisioning)
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
            (WorkspaceStatus::Provisioning, WorkspaceStatus::Active),
            (WorkspaceStatus::Provisioning, WorkspaceStatus::Archiving),
            (WorkspaceStatus::Active, WorkspaceStatus::Archiving),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Archived),
            (WorkspaceStatus::Failed, WorkspaceStatus::Provisioning),
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
            (WorkspaceStatus::Provisioning, WorkspaceStatus::Provisioning),
            (WorkspaceStatus::Provisioning, WorkspaceStatus::Failed),
            (WorkspaceStatus::Active, WorkspaceStatus::Archived),
            (WorkspaceStatus::Active, WorkspaceStatus::Provisioning),
            (WorkspaceStatus::Archived, WorkspaceStatus::Provisioning),
            (WorkspaceStatus::Archived, WorkspaceStatus::Active),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Active),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Provisioning),
        ];

        for (from, to) in cases {
            assert!(
                validate_workspace_transition(&from, &to).is_err(),
                "Expected {from} -> {to} to be invalid"
            );
        }
    }
}
