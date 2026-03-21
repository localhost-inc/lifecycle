use crate::shared::errors::{LifecycleError, WorkspaceStatus};

pub fn validate_workspace_transition(
    from: &WorkspaceStatus,
    to: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (from, to),
        (WorkspaceStatus::Active, WorkspaceStatus::Preparing)
            | (WorkspaceStatus::Preparing, WorkspaceStatus::Active)
            | (WorkspaceStatus::Active, WorkspaceStatus::Archiving)
            | (WorkspaceStatus::Preparing, WorkspaceStatus::Archiving)
            | (WorkspaceStatus::Archiving, WorkspaceStatus::Archived)
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
            (WorkspaceStatus::Active, WorkspaceStatus::Preparing),
            (WorkspaceStatus::Preparing, WorkspaceStatus::Active),
            (WorkspaceStatus::Active, WorkspaceStatus::Archiving),
            (WorkspaceStatus::Preparing, WorkspaceStatus::Archiving),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Archived),
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
            (WorkspaceStatus::Active, WorkspaceStatus::Archived),
            (WorkspaceStatus::Preparing, WorkspaceStatus::Preparing),
            (WorkspaceStatus::Archived, WorkspaceStatus::Preparing),
            (WorkspaceStatus::Archived, WorkspaceStatus::Active),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Active),
            (WorkspaceStatus::Archiving, WorkspaceStatus::Preparing),
        ];

        for (from, to) in cases {
            assert!(
                validate_workspace_transition(&from, &to).is_err(),
                "Expected {from} -> {to} to be invalid"
            );
        }
    }
}
