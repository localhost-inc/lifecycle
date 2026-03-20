use crate::shared::errors::{LifecycleError, EnvironmentStatus};

pub fn validate_environment_transition(
    from: &EnvironmentStatus,
    to: &EnvironmentStatus,
) -> Result<(), LifecycleError> {
    let allowed = matches!(
        (from, to),
        // idle -> starting
        (EnvironmentStatus::Idle, EnvironmentStatus::Starting)
            // starting -> running | stopping | idle
            | (EnvironmentStatus::Starting, EnvironmentStatus::Running)
            | (EnvironmentStatus::Starting, EnvironmentStatus::Stopping)
            | (EnvironmentStatus::Starting, EnvironmentStatus::Idle)
            // running -> starting | stopping
            | (EnvironmentStatus::Running, EnvironmentStatus::Starting)
            | (EnvironmentStatus::Running, EnvironmentStatus::Stopping)
            // stopping -> idle
            | (EnvironmentStatus::Stopping, EnvironmentStatus::Idle)
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
            (EnvironmentStatus::Idle, EnvironmentStatus::Starting),
            (EnvironmentStatus::Starting, EnvironmentStatus::Running),
            (EnvironmentStatus::Starting, EnvironmentStatus::Stopping),
            (EnvironmentStatus::Starting, EnvironmentStatus::Idle),
            (EnvironmentStatus::Running, EnvironmentStatus::Starting),
            (EnvironmentStatus::Running, EnvironmentStatus::Stopping),
            (EnvironmentStatus::Stopping, EnvironmentStatus::Idle),
        ];

        for (from, to) in cases {
            assert!(
                validate_environment_transition(&from, &to).is_ok(),
                "Expected {from} -> {to} to be valid"
            );
        }
    }

    #[test]
    fn invalid_transitions() {
        let cases = vec![
            (EnvironmentStatus::Idle, EnvironmentStatus::Running),
            (EnvironmentStatus::Idle, EnvironmentStatus::Stopping),
            (EnvironmentStatus::Starting, EnvironmentStatus::Starting),
            (EnvironmentStatus::Running, EnvironmentStatus::Running),
            (EnvironmentStatus::Stopping, EnvironmentStatus::Starting),
            (EnvironmentStatus::Stopping, EnvironmentStatus::Running),
        ];

        for (from, to) in cases {
            assert!(
                validate_environment_transition(&from, &to).is_err(),
                "Expected {from} -> {to} to be invalid"
            );
        }
    }
}
