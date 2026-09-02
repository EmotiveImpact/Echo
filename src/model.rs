use serde::{Deserialize, Serialize};

pub const VOICES: &[(&str, &str)] = &[
    ("en-US-AriaNeural", "Aria"),
    ("en-US-JennyNeural", "Jenny"),
    ("en-US-AndrewNeural", "Andrew"),
    ("en-US-EmmaNeural", "Emma"),
    ("en-US-GuyNeural", "Guy"),
    ("en-GB-SoniaNeural", "Sonia"),
    ("en-GB-RyanNeural", "Ryan"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Source {
    Cursor,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reply {
    pub id: String,
    pub text: String,
    pub created_at: u64,
    pub source: Source,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub voice: String,
    pub rate: f32,
    pub skip_code: bool,
    pub skip_urls: bool,
    pub clipboard_watch: bool,
    pub autoplay: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            voice: "en-US-AriaNeural".to_string(),
            rate: 1.05,
            skip_code: true,
            skip_urls: true,
            clipboard_watch: true,
            autoplay: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayStatus {
    Idle,
    Loading,
    Playing,
    Paused,
}

#[derive(Debug, Clone)]
pub struct PlayerView {
    pub status: PlayStatus,
    pub reply_id: Option<String>,
    pub chunk: usize,
    pub chunk_count: usize,
    pub error: Option<String>,
}

impl Default for PlayerView {
    fn default() -> Self {
        Self {
            status: PlayStatus::Idle,
            reply_id: None,
            chunk: 0,
            chunk_count: 0,
            error: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CursorView {
    pub connected: bool,
    pub email: Option<String>,
    pub error: Option<String>,
    pub checking: bool,
    pub login_url: Option<String>,
}

impl Default for CursorView {
    fn default() -> Self {
        Self {
            connected: false,
            email: None,
            error: None,
            checking: false,
            login_url: None,
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub replies: Vec<Reply>,
    pub settings: Settings,
    pub player: PlayerView,
    pub cursor: CursorView,
}

#[derive(Debug, Clone)]
pub enum Command {
    ConnectBrowser,
    ConnectKey(String),
    Disconnect,
    CaptureText { text: String, play: bool },
    SetWatch(bool),
    SetAutoplay(bool),
    SetVoice(String),
    SetRate(f32),
    SetSkip { code: bool, urls: bool },
    Play { id: String, start: usize },
    Pause,
    Resume,
    Next,
    Prev,
    Stop,
}

#[derive(Debug, Clone)]
pub enum Event {
    Snapshot(Snapshot),
    #[allow(dead_code)]
    Toast(String),
}

pub fn voice_label(uri: &str) -> &'static str {
    VOICES
        .iter()
        .find(|(id, _)| *id == uri)
        .map(|(_, name)| *name)
        .unwrap_or("Aria")
}

pub fn resolve_voice(uri: &str) -> &'static str {
    VOICES
        .iter()
        .find(|(id, _)| *id == uri)
        .map(|(id, _)| *id)
        .unwrap_or("en-US-AriaNeural")
}
