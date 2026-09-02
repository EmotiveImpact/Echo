use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::sync::mpsc::{self, Receiver, Sender};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use serde::Deserialize;

use crate::config;
use crate::cursor;
use crate::model::{
    Command, CursorView, Event, PlayStatus, PlayerView, Reply, Settings, Snapshot, Source,
};
use crate::speakable::{build_speakable, SpeakOptions};
use crate::tts;

pub fn spawn() -> (Sender<Command>, Receiver<Event>) {
    let (cmd_tx, cmd_rx) = mpsc::channel();
    let (evt_tx, evt_rx) = mpsc::channel();
    let _ = std::thread::Builder::new()
        .name("echo-worker".into())
        .spawn(move || {
            if let Ok(runtime) = tokio::runtime::Runtime::new() {
                runtime.block_on(run(cmd_rx, evt_tx));
            }
        });
    (cmd_tx, evt_rx)
}

struct Player {
    status: PlayStatus,
    reply_id: Option<String>,
    chunks: Vec<String>,
    chunk: usize,
    generation: u64,
    error: Option<String>,
    stream: Option<OutputStream>,
    handle: Option<OutputStreamHandle>,
    sink: Option<Sink>,
    cache: HashMap<(String, String), Vec<u8>>,
}

impl Player {
    fn view(&self) -> PlayerView {
        PlayerView {
            status: self.status,
            reply_id: self.reply_id.clone(),
            chunk: self.chunk,
            chunk_count: self.chunks.len(),
            error: self.error.clone(),
        }
    }

    fn ensure_output(&mut self) -> Result<(), String> {
        if self.handle.is_some() {
            return Ok(());
        }
        let (stream, handle) =
            OutputStream::try_default().map_err(|error| error.to_string())?;
        self.stream = Some(stream);
        self.handle = Some(handle);
        Ok(())
    }

    fn stop_audio(&mut self) {
        if let Some(sink) = self.sink.take() {
            sink.stop();
        }
    }
}

struct State {
    replies: Vec<Reply>,
    settings: Settings,
    cursor: CursorView,
    api_key: Option<String>,
    delivered: HashSet<String>,
    player: Player,
    last_hook: Instant,
    last_cursor: Instant,
    dirty: bool,
}

async fn run(cmd_rx: Receiver<Command>, evt_tx: Sender<Event>) {
    let settings = config::load_settings();
    let api_key = config::load_api_key();
    let mut state = State {
        replies: Vec::new(),
        settings,
        cursor: CursorView {
            connected: api_key.is_some(),
            checking: api_key.is_some(),
            ..CursorView::default()
        },
        api_key,
        delivered: config::load_delivered().into_iter().collect(),
        player: Player {
            status: PlayStatus::Idle,
            reply_id: None,
            chunks: Vec::new(),
            chunk: 0,
            generation: 0,
            error: None,
            stream: None,
            handle: None,
            sink: None,
            cache: HashMap::new(),
        },
        last_hook: Instant::now() - Duration::from_secs(10),
        last_cursor: Instant::now() - Duration::from_secs(30),
        dirty: true,
    };

    if state.api_key.is_some() {
        refresh_cursor(&mut state).await;
    }
    ingest_hooks(&mut state);
    publish(&state, &evt_tx);

    loop {
        while let Ok(command) = cmd_rx.try_recv() {
            handle_command(&mut state, command, &evt_tx).await;
        }

        if state.last_hook.elapsed() >= Duration::from_secs(2) {
            ingest_hooks(&mut state);
            state.last_hook = Instant::now();
        }

        if state.api_key.is_some() && state.last_cursor.elapsed() >= Duration::from_secs(20) {
            poll_cursor(&mut state).await;
            state.last_cursor = Instant::now();
        }

        tick_player(&mut state).await;

        if state.dirty {
            publish(&state, &evt_tx);
            state.dirty = false;
        }

        tokio::time::sleep(Duration::from_millis(40)).await;
    }
}

async fn handle_command(state: &mut State, command: Command, evt_tx: &Sender<Event>) {
    match command {
        Command::Connect(key) => {
            state.cursor.checking = true;
            state.cursor.error = None;
            state.dirty = true;
            publish(state, evt_tx);
            match cursor::whoami(&key).await {
                Ok(email) => {
                    if let Err(error) = config::save_api_key(&key) {
                        state.cursor = CursorView {
                            connected: false,
                            checking: false,
                            email: None,
                            error: Some(error.to_string()),
                        };
                    } else {
                        state.api_key = Some(key);
                        state.cursor = CursorView {
                            connected: true,
                            checking: false,
                            email,
                            error: None,
                        };
                        poll_cursor(state).await;
                        state.last_cursor = Instant::now();
                    }
                }
                Err(error) => {
                    state.cursor = CursorView {
                        connected: false,
                        checking: false,
                        email: None,
                        error: Some(error),
                    };
                }
            }
            state.dirty = true;
        }
        Command::Disconnect => {
            state.api_key = None;
            config::clear_api_key();
            state.cursor = CursorView::default();
            state.dirty = true;
        }
        Command::CaptureText { text, play } => {
            if let Some(reply) = push_reply(state, text, Source::Manual) {
                if play || state.settings.autoplay {
                    start_play(state, &reply.id, 0);
                }
            }
        }
        Command::SetWatch(value) => {
            state.settings.clipboard_watch = value;
            config::save_settings(&state.settings);
            state.dirty = true;
        }
        Command::SetAutoplay(value) => {
            state.settings.autoplay = value;
            config::save_settings(&state.settings);
            state.dirty = true;
        }
        Command::SetVoice(voice) => {
            state.settings.voice = crate::model::resolve_voice(&voice).to_string();
            config::save_settings(&state.settings);
            state.dirty = true;
        }
        Command::SetRate(rate) => {
            state.settings.rate = rate.clamp(0.75, 1.4);
            if let Some(sink) = state.player.sink.as_ref() {
                sink.set_speed(state.settings.rate);
            }
            config::save_settings(&state.settings);
            state.dirty = true;
        }
        Command::SetSkip { code, urls } => {
            state.settings.skip_code = code;
            state.settings.skip_urls = urls;
            config::save_settings(&state.settings);
            state.dirty = true;
        }
        Command::Play { id, start } => start_play(state, &id, start),
        Command::Pause => {
            if let Some(sink) = state.player.sink.as_ref() {
                sink.pause();
                state.player.status = PlayStatus::Paused;
                state.dirty = true;
            }
        }
        Command::Resume => {
            if let Some(sink) = state.player.sink.as_ref() {
                sink.play();
                state.player.status = PlayStatus::Playing;
                state.dirty = true;
            }
        }
        Command::Next => {
            if !state.player.chunks.is_empty() {
                let next = (state.player.chunk + 1).min(state.player.chunks.len().saturating_sub(1));
                if let Some(id) = state.player.reply_id.clone() {
                    start_play(state, &id, next);
                }
            }
        }
        Command::Prev => {
            if let Some(id) = state.player.reply_id.clone() {
                let prev = state.player.chunk.saturating_sub(1);
                start_play(state, &id, prev);
            }
        }
        Command::Stop => {
            state.player.generation += 1;
            state.player.stop_audio();
            state.player.status = PlayStatus::Idle;
            state.player.error = None;
            state.dirty = true;
        }
    }
}

fn start_play(state: &mut State, id: &str, start: usize) {
    let Some(reply) = state.replies.iter().find(|reply| reply.id == id).cloned() else {
        return;
    };
    let doc = build_speakable(
        &reply.text,
        SpeakOptions {
            skip_code: state.settings.skip_code,
            skip_urls: state.settings.skip_urls,
        },
    );
    if doc.chunks.is_empty() {
        state.player.error = Some("Nothing speakable in that reply.".into());
        state.dirty = true;
        return;
    }
    state.player.generation += 1;
    state.player.stop_audio();
    state.player.reply_id = Some(id.to_string());
    state.player.chunks = doc.chunks;
    state.player.chunk = start.min(state.player.chunks.len() - 1);
    state.player.status = PlayStatus::Loading;
    state.player.error = None;
    state.dirty = true;
}

async fn tick_player(state: &mut State) {
    if state.player.status == PlayStatus::Playing {
        let empty = state
            .player
            .sink
            .as_ref()
            .map(Sink::empty)
            .unwrap_or(true);
        if empty {
            if state.player.chunk + 1 < state.player.chunks.len() {
                let id = state.player.reply_id.clone().unwrap_or_default();
                start_play(state, &id, state.player.chunk + 1);
            } else {
                state.player.status = PlayStatus::Idle;
                state.player.stop_audio();
                state.dirty = true;
                return;
            }
        }
    }

    if state.player.status != PlayStatus::Loading {
        return;
    }

    let Some(text) = state.player.chunks.get(state.player.chunk).cloned() else {
        state.player.status = PlayStatus::Idle;
        state.dirty = true;
        return;
    };
    let voice = state.settings.voice.clone();
    let generation = state.player.generation;
    let cache_key = (voice.clone(), text.clone());
    let audio = if let Some(bytes) = state.player.cache.get(&cache_key).cloned() {
        Ok(bytes)
    } else {
        tts::synthesize(&text, &voice).await
    };

    if generation != state.player.generation {
        return;
    }

    match audio {
        Ok(bytes) => {
            if let Err(error) = play_bytes(state, bytes.clone()) {
                state.player.status = PlayStatus::Idle;
                state.player.error = Some(error);
            } else {
                if state.player.cache.len() > 64 {
                    state.player.cache.clear();
                }
                state.player.cache.insert(cache_key, bytes);
                state.player.status = PlayStatus::Playing;
                state.player.error = None;
            }
        }
        Err(error) => {
            state.player.status = PlayStatus::Idle;
            state.player.error = Some(error);
        }
    }
    state.dirty = true;
}

fn play_bytes(state: &mut State, bytes: Vec<u8>) -> Result<(), String> {
    state.player.ensure_output()?;
    let handle = state
        .player
        .handle
        .as_ref()
        .ok_or_else(|| "No audio output.".to_string())?;
    let sink = Sink::try_new(handle).map_err(|error| error.to_string())?;
    let decoder = Decoder::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
    sink.set_speed(state.settings.rate);
    sink.append(decoder);
    sink.play();
    state.player.stop_audio();
    state.player.sink = Some(sink);
    Ok(())
}

fn ingest_hooks(state: &mut State) {
    for path in config::response_files() {
        let Ok(contents) = std::fs::read_to_string(path) else {
            continue;
        };
        for line in contents.lines() {
            if line.trim().is_empty() {
                continue;
            }
            let Ok(parsed) = serde_json::from_str::<HookLine>(line) else {
                continue;
            };
            if parsed.text.trim().is_empty() || state.delivered.contains(&parsed.id) {
                continue;
            }
            state.delivered.insert(parsed.id.clone());
            let reply = Reply {
                id: parsed.id,
                text: parsed.text,
                created_at: parsed.created_at.unwrap_or_else(now_ms),
                source: Source::Cursor,
            };
            insert_reply(state, reply, state.settings.autoplay);
        }
    }
    persist_delivered(state);
}

async fn refresh_cursor(state: &mut State) {
    let Some(key) = state.api_key.clone() else {
        return;
    };
    match cursor::whoami(&key).await {
        Ok(email) => {
            state.cursor.connected = true;
            state.cursor.email = email;
            state.cursor.error = None;
            state.cursor.checking = false;
        }
        Err(error) => {
            state.cursor.connected = false;
            state.cursor.checking = false;
            state.cursor.error = Some(error);
        }
    }
    state.dirty = true;
}

async fn poll_cursor(state: &mut State) {
    let Some(key) = state.api_key.clone() else {
        return;
    };
    match cursor::list_agents(&key).await {
        Ok(agents) => {
            state.cursor.error = None;
            for agent in agents.into_iter().take(8) {
                let Ok(runs) = cursor::list_runs(&agent.id, &key).await else {
                    continue;
                };
                for run in runs.into_iter().take(4) {
                    if state.delivered.contains(&run.id) || !cursor::is_finished(&run.status) {
                        continue;
                    }
                    state.delivered.insert(run.id.clone());
                    if matches!(run.status.as_str(), "FINISHED" | "finished") {
                        if let Some(text) = run.result.map(|value| value.trim().to_string()) {
                            if !text.is_empty() {
                                let reply = Reply {
                                    id: format!("cursor-api:{}", run.id),
                                    text,
                                    created_at: parse_time(run.updated_at.or(agent.updated_at.clone())),
                                    source: Source::Cursor,
                                };
                                insert_reply(state, reply, state.settings.autoplay);
                            }
                        }
                    }
                }
            }
            persist_delivered(state);
        }
        Err(error) => {
            if !error.contains("404") && !error.contains("409") && !error.contains("410") {
                state.cursor.error = Some(error);
                state.dirty = true;
            }
        }
    }
}

fn push_reply(state: &mut State, text: String, source: Source) -> Option<Reply> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return None;
    }
    let reply = Reply {
        id: format!("manual:{}", now_ms()),
        text,
        created_at: now_ms(),
        source,
    };
    insert_reply(state, reply.clone(), false);
    Some(reply)
}

fn insert_reply(state: &mut State, reply: Reply, play: bool) {
    if state.replies.iter().any(|existing| existing.id == reply.id) {
        return;
    }
    let id = reply.id.clone();
    state.replies.insert(0, reply);
    state.replies.truncate(40);
    state.dirty = true;
    if play {
        start_play(state, &id, 0);
    }
}

fn persist_delivered(state: &State) {
    let mut ids: Vec<String> = state.delivered.iter().cloned().collect();
    ids.sort();
    if ids.len() > 500 {
        ids = ids.split_off(ids.len() - 500);
    }
    config::save_delivered(&ids);
}

fn publish(state: &State, evt_tx: &Sender<Event>) {
    let _ = evt_tx.send(Event::Snapshot(Snapshot {
        replies: state.replies.clone(),
        settings: state.settings.clone(),
        player: state.player.view(),
        cursor: state.cursor.clone(),
    }));
}

fn parse_time(value: Option<String>) -> u64 {
    value
        .and_then(|raw| chrono::DateTime::parse_from_rfc3339(&raw).ok())
        .map(|when| when.timestamp_millis().max(0) as u64)
        .unwrap_or_else(now_ms)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Debug, Deserialize)]
struct HookLine {
    id: String,
    text: String,
    #[serde(alias = "createdAt")]
    created_at: Option<u64>,
}
