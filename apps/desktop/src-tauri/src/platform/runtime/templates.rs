use crate::shared::errors::LifecycleError;
use std::collections::HashMap;

/// Expand `${KEY}` templates using values from `env`. Variables present in
/// `env` are substituted; variables absent from `env` are left untouched
/// so external env vars pass through to the process.
pub fn expand_templates(
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
        if let Some(value) = env.get(key) {
            output.push_str(value);
        } else {
            // Pass through unresolved variables.
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
    fn expands_known_variables() {
        let env = HashMap::from([(
            "API_URL".to_string(),
            "http://api.example.localhost:3000".to_string(),
        )]);

        let rendered = expand_templates("${API_URL}", &env, "env.ORIGIN")
            .expect("template expansion succeeds");

        assert_eq!(rendered, "http://api.example.localhost:3000");
    }

    #[test]
    fn preserves_unknown_variables() {
        let env = HashMap::new();

        let rendered = expand_templates("${EXTERNAL_KEY}", &env, "env.KEY")
            .expect("unknown vars pass through");

        assert_eq!(rendered, "${EXTERNAL_KEY}");
    }

    #[test]
    fn mixed_known_and_unknown() {
        let env = HashMap::from([("PORT".to_string(), "3000".to_string())]);

        let rendered = expand_templates(
            "http://localhost:${PORT}?key=${API_KEY}",
            &env,
            "env.URL",
        )
        .expect("mixed expansion");

        assert_eq!(rendered, "http://localhost:3000?key=${API_KEY}");
    }
}
