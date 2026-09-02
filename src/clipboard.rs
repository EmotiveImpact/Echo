pub fn should_auto_capture(text: &str, previous: &str) -> bool {
    let trimmed = text.trim();
    let prior = previous.trim();
    if trimmed.is_empty() || trimmed == prior {
        return false;
    }
    if trimmed.len() < 48 {
        return false;
    }
    if !trimmed.chars().any(char::is_whitespace) {
        return false;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if !trimmed.contains(' ') {
            return false;
        }
    }
    if is_token_like(trimmed) {
        return false;
    }
    true
}

fn is_token_like(text: &str) -> bool {
    text.len() >= 48
        && text.chars().all(|ch| {
            ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '_' | '-' | '=')
        })
}

#[cfg(test)]
mod tests {
    use super::should_auto_capture;

    #[test]
    fn captures_prose() {
        assert!(should_auto_capture(
            "Echo should pick this sentence up automatically once you copy it from Cursor.",
            ""
        ));
    }

    #[test]
    fn ignores_same_text() {
        let text =
            "Echo should pick this sentence up automatically once you copy it from Cursor.";
        assert!(!should_auto_capture(text, text));
    }

    #[test]
    fn ignores_short_url_and_token() {
        assert!(!should_auto_capture("ok", ""));
        assert!(!should_auto_capture(
            "https://github.com/EmotiveImpact/Echo",
            ""
        ));
        assert!(!should_auto_capture(
            "sk-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij",
            ""
        ));
    }
}
