use crate::shared::errors::LifecycleError;
use std::iter::Peekable;

pub(super) struct ZeroSeparatedRecords<'a> {
    operation: &'a str,
    parts:
        Peekable<std::iter::Filter<std::slice::Split<'a, u8, fn(&u8) -> bool>, fn(&&[u8]) -> bool>>,
}

impl<'a> ZeroSeparatedRecords<'a> {
    pub(super) fn new(output: &'a [u8], operation: &'a str) -> Self {
        Self {
            operation,
            parts: output
                .split(is_zero_byte as fn(&u8) -> bool)
                .filter(is_non_empty_record as fn(&&[u8]) -> bool)
                .peekable(),
        }
    }

    pub(super) fn next_str(&mut self) -> Result<Option<&'a str>, LifecycleError> {
        self.parts
            .next()
            .map(|part| {
                std::str::from_utf8(part).map_err(|error| LifecycleError::GitOperationFailed {
                    operation: self.operation.to_string(),
                    reason: error.to_string(),
                })
            })
            .transpose()
    }

    pub(super) fn next_required_str(&mut self, reason: &str) -> Result<&'a str, LifecycleError> {
        self.next_str()?
            .ok_or_else(|| LifecycleError::GitOperationFailed {
                operation: self.operation.to_string(),
                reason: reason.to_string(),
            })
    }
}

fn is_zero_byte(value: &u8) -> bool {
    *value == 0
}

fn is_non_empty_record(value: &&[u8]) -> bool {
    !value.is_empty()
}
