use crate::shared::errors::{LifecycleError, WorkspaceStatus};

pub fn validate_workspace_transition(
    from: &WorkspaceStatus,
    to: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (from, to),
        // creating -> sleeping | starting | failed
        (WorkspaceStatus::Creating, WorkspaceStatus::Sleeping)
            | (WorkspaceStatus::Creating, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Creating, WorkspaceStatus::Failed)
            // starting -> ready | failed
            | (WorkspaceStatus::Starting, WorkspaceStatus::Ready)
            | (WorkspaceStatus::Starting, WorkspaceStatus::Failed)
            // ready -> starting | resetting | sleeping | destroying | failed
            | (WorkspaceStatus::Ready, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Ready, WorkspaceStatus::Resetting)
            | (WorkspaceStatus::Ready, WorkspaceStatus::Sleeping)
            | (WorkspaceStatus::Ready, WorkspaceStatus::Destroying)
            | (WorkspaceStatus::Ready, WorkspaceStatus::Failed)
            // resetting -> starting | failed
            | (WorkspaceStatus::Resetting, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Resetting, WorkspaceStatus::Failed)
            // sleeping -> starting | destroying | failed
            | (WorkspaceStatus::Sleeping, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Sleeping, WorkspaceStatus::Destroying)
            | (WorkspaceStatus::Sleeping, WorkspaceStatus::Failed)
            // failed -> starting | resetting | destroying
            | (WorkspaceStatus::Failed, WorkspaceStatus::Starting)
            | (WorkspaceStatus::Failed, WorkspaceStatus::Resetting)
            | (WorkspaceStatus::Failed, WorkspaceStatus::Destroying)
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
            (WorkspaceStatus::Creating, WorkspaceStatus::Sleeping),
            (WorkspaceStatus::Creating, WorkspaceStatus::Starting),
            (WorkspaceStatus::Creating, WorkspaceStatus::Failed),
            (WorkspaceStatus::Starting, WorkspaceStatus::Ready),
            (WorkspaceStatus::Starting, WorkspaceStatus::Failed),
            (WorkspaceStatus::Ready, WorkspaceStatus::Starting),
            (WorkspaceStatus::Ready, WorkspaceStatus::Resetting),
            (WorkspaceStatus::Ready, WorkspaceStatus::Sleeping),
            (WorkspaceStatus::Ready, WorkspaceStatus::Destroying),
            (WorkspaceStatus::Ready, WorkspaceStatus::Failed),
            (WorkspaceStatus::Resetting, WorkspaceStatus::Starting),
            (WorkspaceStatus::Resetting, WorkspaceStatus::Failed),
            (WorkspaceStatus::Sleeping, WorkspaceStatus::Starting),
            (WorkspaceStatus::Sleeping, WorkspaceStatus::Destroying),
            (WorkspaceStatus::Sleeping, WorkspaceStatus::Failed),
            (WorkspaceStatus::Failed, WorkspaceStatus::Starting),
            (WorkspaceStatus::Failed, WorkspaceStatus::Resetting),
            (WorkspaceStatus::Failed, WorkspaceStatus::Destroying),
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
            (WorkspaceStatus::Creating, WorkspaceStatus::Ready),
            (WorkspaceStatus::Creating, WorkspaceStatus::Destroying),
            (WorkspaceStatus::Starting, WorkspaceStatus::Creating),
            (WorkspaceStatus::Starting, WorkspaceStatus::Sleeping),
            (WorkspaceStatus::Ready, WorkspaceStatus::Creating),
            (WorkspaceStatus::Resetting, WorkspaceStatus::Ready),
            (WorkspaceStatus::Sleeping, WorkspaceStatus::Ready),
            (WorkspaceStatus::Sleeping, WorkspaceStatus::Resetting),
            (WorkspaceStatus::Failed, WorkspaceStatus::Ready),
            (WorkspaceStatus::Failed, WorkspaceStatus::Sleeping),
            (WorkspaceStatus::Failed, WorkspaceStatus::Creating),
            (WorkspaceStatus::Destroying, WorkspaceStatus::Ready),
            (WorkspaceStatus::Destroying, WorkspaceStatus::Failed),
        ];

        for (from, to) in cases {
            assert!(
                validate_workspace_transition(&from, &to).is_err(),
                "Expected {from} -> {to} to be invalid"
            );
        }
    }
}
