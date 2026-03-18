use crate::shared::errors::LifecycleError;
use std::collections::HashMap;

pub fn expand_reserved_runtime_templates(
    input: &str,
    env: &HashMap<String, String>,
    field: &str,
) -> Result<String, LifecycleError> {
    let mut output = String::new();
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find('}') else {
            return Err(LifecycleError::InvalidInput {
                field: field.to_string(),
                reason: format!("unterminated template in '{input}'"),
            });
        };

        let key = &after_start[..end];
        if key.starts_with("LIFECYCLE_") {
            let value = env.get(key).ok_or_else(|| LifecycleError::InvalidInput {
                field: field.to_string(),
                reason: format!("unknown runtime variable '{key}'"),
            })?;
            output.push_str(value);
        } else {
            output.push_str("${");
            output.push_str(key);
            output.push('}');
        }

        rest = &after_start[end + 1..];
    }

    output.push_str(rest);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_reserved_runtime_templates() {
        let env = HashMap::from([(
            "LIFECYCLE_SERVICE_API_URL".to_string(),
            "http://api.frost-beacon-57f59253.lifecycle.localhost:52300".to_string(),
        )]);

        let rendered = expand_reserved_runtime_templates(
            "${LIFECYCLE_SERVICE_API_URL}",
            &env,
            "environment.web.env.VITE_API_ORIGIN",
        )
        .expect("runtime template expansion succeeds");

        assert_eq!(
            rendered,
            "http://api.frost-beacon-57f59253.lifecycle.localhost:52300"
        );
    }

    #[test]
    fn preserves_non_runtime_templates() {
        let env = HashMap::new();

        let rendered = expand_reserved_runtime_templates(
            "${EXTERNAL_API_KEY}",
            &env,
            "environment.api.env.API_KEY",
        )
        .expect("non-runtime templates are preserved");

        assert_eq!(rendered, "${EXTERNAL_API_KEY}");
    }

    #[test]
    fn rejects_unknown_runtime_templates() {
        let env = HashMap::new();

        let error = expand_reserved_runtime_templates(
            "${LIFECYCLE_SERVICE_API_URL}",
            &env,
            "environment.web.env.VITE_API_ORIGIN",
        )
        .expect_err("unknown runtime templates should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "environment.web.env.VITE_API_ORIGIN");
                assert!(reason.contains("unknown runtime variable"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
