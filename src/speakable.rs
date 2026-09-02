use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockKind {
    Heading,
    Paragraph,
    List,
    Quote,
    Code,
}

#[derive(Debug, Clone)]
pub struct Sentence {
    #[allow(dead_code)]
    pub id: String,
    pub speak: String,
}

#[derive(Debug, Clone)]
pub struct Block {
    pub kind: BlockKind,
    pub sentences: Vec<Sentence>,
    pub skipped: bool,
    #[allow(dead_code)]
    pub note: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SpeakableDoc {
    pub blocks: Vec<Block>,
    pub chunks: Vec<String>,
    pub skipped_code_blocks: usize,
}

#[derive(Debug, Clone, Copy)]
pub struct SpeakOptions {
    pub skip_code: bool,
    pub skip_urls: bool,
}

enum Segment {
    Prose(String),
    Code { lang: String, body: String },
}

pub fn build_speakable(raw: &str, options: SpeakOptions) -> SpeakableDoc {
    let text = raw.replace("\r\n", "\n").trim().to_string();
    if text.is_empty() {
        return SpeakableDoc {
            blocks: Vec::new(),
            chunks: Vec::new(),
            skipped_code_blocks: 0,
        };
    }

    let mut blocks = Vec::new();
    let mut skipped_code_blocks = 0;
    let mut counter = 0usize;
    let mut next_id = |prefix: &str| {
        counter += 1;
        format!("{prefix}-{counter}")
    };

    for segment in split_fences(&text) {
        match segment {
            Segment::Code { lang, body } => {
                skipped_code_blocks += 1;
                if options.skip_code {
                    blocks.push(Block {
                        kind: BlockKind::Code,
                        sentences: Vec::new(),
                        skipped: true,
                        note: Some(code_fence_note(&lang, &body)),
                    });
                    continue;
                }
                let spoken = speak_code(&body);
                let skipped = spoken.is_empty();
                blocks.push(Block {
                    kind: BlockKind::Code,
                    sentences: if skipped {
                        Vec::new()
                    } else {
                        vec![Sentence {
                            id: next_id("s"),
                            speak: spoken,
                        }]
                    },
                    skipped,
                    note: None,
                });
            }
            Segment::Prose(body) => {
                for prose in split_prose(&body) {
                    let speak_base = markdown_to_speech(&prose.source, options);
                    if speak_base.trim().is_empty() {
                        continue;
                    }
                    let sentences: Vec<Sentence> = split_sentences(&speak_base)
                        .into_iter()
                        .map(|speak| Sentence {
                            id: next_id("s"),
                            speak: cap_chunk(&speak),
                        })
                        .collect();
                    if sentences.is_empty() {
                        continue;
                    }
                    blocks.push(Block {
                        kind: prose.kind,
                        sentences,
                        skipped: false,
                        note: None,
                    });
                }
            }
        }
    }

    let chunks = blocks
        .iter()
        .filter(|block| !block.skipped)
        .flat_map(|block| block.sentences.iter().map(|sentence| sentence.speak.clone()))
        .collect();

    SpeakableDoc {
        blocks,
        chunks,
        skipped_code_blocks,
    }
}

fn split_fences(text: &str) -> Vec<Segment> {
    let mut parts = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("```") {
        if start > 0 {
            parts.push(Segment::Prose(rest[..start].to_string()));
        }
        let after = &rest[start + 3..];
        let (lang, body_and_more) = match after.find('\n') {
            Some(idx) => (after[..idx].trim().to_string(), &after[idx + 1..]),
            None => (after.trim().to_string(), ""),
        };
        if let Some(end) = body_and_more.find("```") {
            parts.push(Segment::Code {
                lang,
                body: body_and_more[..end].to_string(),
            });
            rest = &body_and_more[end + 3..];
        } else {
            parts.push(Segment::Code {
                lang,
                body: body_and_more.to_string(),
            });
            rest = "";
        }
    }
    if !rest.is_empty() {
        parts.push(Segment::Prose(rest.to_string()));
    }
    parts
}

struct ProseChunk {
    kind: BlockKind,
    source: String,
}

fn split_prose(body: &str) -> Vec<ProseChunk> {
    body.split("\n\n")
        .map(str::trim)
        .filter(|chunk| !chunk.is_empty())
        .map(|chunk| {
            if heading_re().is_match(chunk) {
                ProseChunk {
                    kind: BlockKind::Heading,
                    source: heading_re().replace(chunk, "").into_owned(),
                }
            } else if chunk.lines().any(|line| line.starts_with("> ") || line == ">") {
                ProseChunk {
                    kind: BlockKind::Quote,
                    source: chunk
                        .lines()
                        .map(|line| line.strip_prefix("> ").or_else(|| line.strip_prefix('>')).unwrap_or(line))
                        .collect::<Vec<_>>()
                        .join("\n"),
                }
            } else if list_re().is_match(chunk) {
                ProseChunk {
                    kind: BlockKind::List,
                    source: chunk.to_string(),
                }
            } else {
                ProseChunk {
                    kind: BlockKind::Paragraph,
                    source: chunk.to_string(),
                }
            }
        })
        .collect()
}

pub fn markdown_to_speech(input: &str, options: SpeakOptions) -> String {
    let mut text = input.to_string();
    text = list_item_re().replace_all(&text, "").into_owned();
    text = numbered_item_re().replace_all(&text, "").into_owned();
    text = image_re().replace_all(&text, "").into_owned();
    text = link_re().replace_all(&text, "$1").into_owned();
    text = inline_code_re().replace_all(&text, "$1").into_owned();
    text = bold_star_re().replace_all(&text, "$1").into_owned();
    text = bold_under_re().replace_all(&text, "$1").into_owned();
    text = italic_star_re().replace_all(&text, "$1").into_owned();
    text = italic_under_re().replace_all(&text, "$1").into_owned();
    text = heading_re().replace_all(&text, "").into_owned();
    text = quote_re().replace_all(&text, "").into_owned();
    text = table_re().replace_all(&text, "").into_owned();
    text = rule_re().replace_all(&text, "").into_owned();
    if options.skip_urls {
        text = url_re().replace_all(&text, "link").into_owned();
    }
    text = comment_re().replace_all(&text, "").into_owned();
    text = trailing_space_re().replace_all(&text, "\n").into_owned();
    text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    text.trim().to_string()
}

pub fn split_sentences(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut placeholders = Vec::new();
    let masked = abbrev_re()
        .replace_all(trimmed, |caps: &regex::Captures| {
            let token = format!("§ABBREV{}§", placeholders.len());
            placeholders.push(caps[0].to_string());
            token
        })
        .into_owned();

    let mut pieces = Vec::new();
    let mut start = 0usize;
    let chars: Vec<(usize, char)> = masked.char_indices().collect();
    for i in 0..chars.len() {
        let (_, ch) = chars[i];
        if !matches!(ch, '.' | '!' | '?') {
            continue;
        }
        let after = chars.get(i + 1).map(|(_, next)| *next);
        if after != Some(' ') && after != Some('\n') {
            continue;
        }
        let next_visible = chars[i + 1..]
            .iter()
            .find(|(_, next)| !next.is_whitespace())
            .map(|(_, next)| *next);
        if let Some(next) = next_visible {
            if next.is_ascii_uppercase()
                || next.is_ascii_digit()
                || matches!(next, '“' | '"' | '\'' | '(')
            {
                let end = chars[i].0 + ch.len_utf8();
                let piece = masked[start..end].trim();
                if !piece.is_empty() {
                    pieces.extend(wrap_long(piece, 280));
                }
                let next_start = chars
                    .iter()
                    .skip(i + 1)
                    .find(|(_, next)| !next.is_whitespace())
                    .map(|(idx, _)| *idx)
                    .unwrap_or(masked.len());
                start = next_start;
            }
        }
    }
    if start < masked.len() {
        let piece = masked[start..].trim();
        if !piece.is_empty() {
            pieces.extend(wrap_long(piece, 280));
        }
    }

    pieces
        .into_iter()
        .map(|piece| {
            let mut out = piece;
            for (index, original) in placeholders.iter().enumerate() {
                out = out.replace(&format!("§ABBREV{index}§"), original);
            }
            out
        })
        .collect()
}

fn wrap_long(text: &str, max: usize) -> Vec<String> {
    if text.chars().count() <= max {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split(' ') {
        let next = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };
        if next.chars().count() > max && !current.is_empty() {
            lines.push(current);
            current = word.to_string();
        } else {
            current = next;
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn cap_chunk(text: &str) -> String {
    wrap_long(text, 280).join(" ")
}

fn speak_code(body: &str) -> String {
    let compact = body.trim();
    if compact.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = compact.lines().filter(|line| !line.trim().is_empty()).collect();
    if lines.len() > 12 || compact.len() > 400 {
        return format!("Short code sample, {} lines.", lines.len());
    }
    format!("Code. {}", lines.join(". "))
}

fn code_fence_note(lang: &str, body: &str) -> String {
    let lines = body.lines().filter(|line| !line.trim().is_empty()).count();
    let label = if lang.is_empty() {
        "Code".to_string()
    } else {
        format!("{lang} code")
    };
    format!(
        "{label} skipped, {lines} line{}",
        if lines == 1 { "" } else { "s" }
    )
}

fn cached(re: &'static OnceLock<Regex>, pattern: &'static str) -> &'static Regex {
    re.get_or_init(|| Regex::new(pattern).expect("valid regex"))
}

fn heading_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^#{1,6}\s+")
}
fn list_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^(\s*[-*+]|\s*\d+\.)\s")
}
fn list_item_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^\s*[-*+]\s+")
}
fn numbered_item_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^\s*\d+\.\s+")
}
fn image_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"!\[[^\]]*]\([^)]*\)")
}
fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"\[([^\]]+)]\([^)]*\)")
}
fn inline_code_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"`([^`]+)`")
}
fn bold_star_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"\*\*([^*]+)\*\*")
}
fn bold_under_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"__([^_]+)__")
}
fn italic_star_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"\*([^*]+)\*")
}
fn italic_under_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"_([^_]+)_")
}
fn quote_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^>\s?")
}
fn table_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^\|.*\|$")
}
fn rule_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?m)^[-*]{3,}$")
}
fn url_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?i)https?://\S+")
}
fn comment_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"<!--[\s\S]*?-->")
}
fn trailing_space_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"[ \t]+\n")
}
fn abbrev_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    cached(&RE, r"(?i)\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr|Ms|Prof|approx|fig)\.")
}

#[cfg(test)]
mod tests {
    use super::{build_speakable, markdown_to_speech, split_sentences, SpeakOptions};

    fn opts() -> SpeakOptions {
        SpeakOptions {
            skip_code: true,
            skip_urls: true,
        }
    }

    #[test]
    fn strips_markdown() {
        let spoken = markdown_to_speech(
            "Hit **play** on the [reply](https://example.com) and hear `speechSynthesis`.",
            opts(),
        );
        assert_eq!(spoken, "Hit play on the reply and hear speechSynthesis.");
    }

    #[test]
    fn replaces_urls() {
        let spoken = markdown_to_speech("See https://cursor.com/docs for this.", opts());
        assert_eq!(spoken, "See link for this.");
    }

    #[test]
    fn keeps_abbreviations() {
        let parts = split_sentences(
            "Cursor has no public chat API. Use this companion, e.g. paste a reply. Then press play.",
        );
        assert_eq!(
            parts,
            vec![
                "Cursor has no public chat API.",
                "Use this companion, e.g. paste a reply.",
                "Then press play.",
            ]
        );
    }

    #[test]
    fn skips_fenced_code() {
        let doc = build_speakable(
            "Paste the reply, then hit play.\n\n```ts\nspeechSynthesis.speak(new SpeechSynthesisUtterance('hi'))\n```\n\nCode is skipped so you do not hear punctuation soup.",
            opts(),
        );
        assert_eq!(doc.skipped_code_blocks, 1);
        assert!(doc.blocks.iter().any(|block| block.kind == super::BlockKind::Code && block.skipped));
        assert_eq!(
            doc.chunks,
            vec![
                "Paste the reply, then hit play.",
                "Code is skipped so you do not hear punctuation soup.",
            ]
        );
    }

    #[test]
    fn empty_input() {
        let doc = build_speakable("   \n  ", opts());
        assert!(doc.chunks.is_empty());
        assert!(doc.blocks.is_empty());
    }
}
