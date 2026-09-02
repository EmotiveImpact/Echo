use std::sync::mpsc::{Receiver, Sender};
use std::time::{Duration, Instant};

use eframe::egui::{
    self, Color32, CornerRadius, FontId, Frame, Key, Margin, RichText, Sense, Stroke, Vec2,
};

use crate::clipboard::should_auto_capture;
use crate::hotkeys::{HotkeyAction, Hotkeys};
use crate::model::{
    Command, Event, PlayStatus, Snapshot, Source, VOICES,
};
use crate::speakable::{build_speakable, SpeakOptions};
use crate::worker;

pub struct EchoApp {
    commands: Sender<Command>,
    events: Receiver<Event>,
    snapshot: Snapshot,
    hotkeys: Hotkeys,
    api_key: String,
    paste: String,
    last_clipboard: String,
    last_watch: Instant,
    toast: Option<(Instant, String)>,
    clipboard: Option<arboard::Clipboard>,
}

impl EchoApp {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        apply_theme(&cc.egui_ctx);
        let (commands, events) = worker::spawn();
        let mut clipboard = arboard::Clipboard::new().ok();
        let last_clipboard = clipboard
            .as_mut()
            .and_then(|board| board.get_text().ok())
            .unwrap_or_default();
        Self {
            commands,
            events,
            snapshot: Snapshot::default(),
            hotkeys: Hotkeys::new(),
            api_key: String::new(),
            paste: String::new(),
            last_clipboard,
            last_watch: Instant::now(),
            toast: None,
            clipboard,
        }
    }

    fn send(&self, command: Command) {
        let _ = self.commands.send(command);
    }

    fn read_clipboard(&mut self, play: bool) {
        let Some(board) = self.clipboard.as_mut() else {
            self.toast = Some((Instant::now(), "Clipboard is unavailable.".into()));
            return;
        };
        match board.get_text() {
            Ok(text) if !text.trim().is_empty() => {
                self.last_clipboard = text.clone();
                self.send(Command::CaptureText { text, play });
            }
            _ => {
                self.toast = Some((
                    Instant::now(),
                    "Clipboard is empty. Copy a reply in Cursor first.".into(),
                ));
            }
        }
    }

    fn poll_clipboard_watch(&mut self) {
        if !self.snapshot.settings.clipboard_watch {
            return;
        }
        if self.last_watch.elapsed() < Duration::from_millis(900) {
            return;
        }
        self.last_watch = Instant::now();
        let Some(board) = self.clipboard.as_mut() else {
            return;
        };
        let Ok(text) = board.get_text() else {
            return;
        };
        if should_auto_capture(&text, &self.last_clipboard) {
            self.last_clipboard = text.clone();
            self.send(Command::CaptureText {
                text,
                play: self.snapshot.settings.autoplay,
            });
        } else {
            self.last_clipboard = text;
        }
    }
}

impl eframe::App for EchoApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(event) = self.events.try_recv() {
            match event {
                Event::Snapshot(snapshot) => {
                    if let Some(error) = snapshot.player.error.clone() {
                        if self.snapshot.player.error.as_deref() != Some(error.as_str()) {
                            self.toast = Some((Instant::now(), error));
                        }
                    }
                    self.snapshot = snapshot;
                }
                Event::Toast(text) => self.toast = Some((Instant::now(), text)),
            }
        }

        match self.hotkeys.poll() {
            Some(HotkeyAction::Capture) => self.read_clipboard(true),
            Some(HotkeyAction::Show) => {
                ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
                ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
            }
            None => {}
        }

        let typing = ctx.wants_keyboard_input();
        if ctx.input(|input| input.modifiers.command && input.modifiers.shift && input.key_pressed(Key::H))
        {
            self.read_clipboard(true);
        }
        if !typing && ctx.input(|input| input.key_pressed(Key::Space) && !input.modifiers.any()) {
            toggle_play(&self.commands, &self.snapshot);
        }
        if !typing && ctx.input(|input| input.key_pressed(Key::ArrowRight)) {
            self.send(Command::Next);
        }
        if !typing && ctx.input(|input| input.key_pressed(Key::ArrowLeft)) {
            self.send(Command::Prev);
        }

        self.poll_clipboard_watch();

        egui::TopBottomPanel::top("echo-top")
            .frame(Frame::NONE.fill(Color32::from_rgb(12, 12, 12)).inner_margin(Margin::same(14)))
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    mark(ui);
                    ui.vertical(|ui| {
                        ui.label(RichText::new("Echo").strong().size(16.0));
                        ui.label(
                            RichText::new("Cursor replies, ready to play")
                                .size(12.0)
                                .color(MUTED),
                        );
                    });
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        status_badge(ui, &self.snapshot);
                    });
                });
            });

        egui::TopBottomPanel::bottom("echo-dock")
            .exact_height(118.0)
            .frame(
                Frame::NONE
                    .fill(Color32::from_rgb(16, 16, 16))
                    .inner_margin(Margin::symmetric(16, 12))
                    .stroke(Stroke::new(1.0, Color32::from_rgb(36, 36, 36))),
            )
            .show(ctx, |ui| dock(ui, &self.snapshot, &self.commands));

        egui::CentralPanel::default()
            .frame(Frame::NONE.fill(BG).inner_margin(Margin::same(16)))
            .show(ctx, |ui| {
                egui::ScrollArea::vertical()
                    .auto_shrink([false, false])
                    .show(ui, |ui| {
                        connect_card(ui, self);
                        ui.add_space(10.0);
                        capture_card(ui, self);
                        ui.add_space(10.0);
                        paste_card(ui, self);
                        ui.add_space(12.0);
                        replies(ui, self);
                    });
            });

        if let Some((when, text)) = self.toast.clone() {
            if when.elapsed() < Duration::from_secs(5) {
                egui::Area::new(egui::Id::new("toast"))
                    .anchor(egui::Align2::CENTER_BOTTOM, [0.0, -140.0])
                    .show(ctx, |ui| {
                        Frame::NONE
                            .fill(Color32::from_rgb(42, 24, 10))
                            .corner_radius(CornerRadius::same(8))
                            .inner_margin(Margin::symmetric(12, 8))
                            .show(ui, |ui| {
                                ui.label(RichText::new(text).color(AMBER));
                            });
                    });
            }
        }

        ctx.request_repaint_after(Duration::from_millis(80));
    }
}

fn connect_card(ui: &mut egui::Ui, app: &mut EchoApp) {
    card(ui, |ui| {
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                let title = if app.snapshot.cursor.connected {
                    "Cursor Cloud connected"
                } else {
                    "Connect Cursor Cloud"
                };
                ui.label(RichText::new(title).strong());
                let detail = if app.snapshot.cursor.checking {
                    "Checking your Cursor key…".to_string()
                } else if let Some(email) = &app.snapshot.cursor.email {
                    format!("{email} · completed runs every 20 seconds")
                } else {
                    "Paste a Cursor API key. Echo stores it in ~/.echo and polls finished Agent runs.".to_string()
                };
                ui.label(RichText::new(detail).size(12.0).color(MUTED));
            });
        });
        if let Some(error) = &app.snapshot.cursor.error {
            ui.add_space(8.0);
            ui.label(RichText::new(error).color(Color32::from_rgb(252, 165, 165)));
        }
        ui.add_space(10.0);
        if app.snapshot.cursor.connected {
            if ui.button("Disconnect").clicked() {
                app.send(Command::Disconnect);
            }
        } else {
            ui.add(
                egui::TextEdit::singleline(&mut app.api_key)
                    .password(true)
                    .hint_text("Cursor API key")
                    .desired_width(ui.available_width()),
            );
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                let ready = !app.api_key.trim().is_empty() && !app.snapshot.cursor.checking;
                if ui.add_enabled(ready, egui::Button::new("Connect Cursor")).clicked() {
                    app.send(Command::Connect(app.api_key.trim().to_string()));
                    app.api_key.clear();
                }
                ui.hyperlink_to("Create a key in Cursor", "https://cursor.com/settings");
            });
        }
    });
}

fn capture_card(ui: &mut egui::Ui, app: &mut EchoApp) {
    card(ui, |ui| {
        ui.horizontal(|ui| {
            if ui
                .add(egui::Button::new("Read clipboard").fill(AMBER).sense(Sense::click()))
                .clicked()
            {
                app.read_clipboard(true);
            }
            ui.add_space(8.0);
            let mut watch = app.snapshot.settings.clipboard_watch;
            if ui.checkbox(&mut watch, "Watch clipboard").changed() {
                app.send(Command::SetWatch(watch));
            }
            let mut autoplay = app.snapshot.settings.autoplay;
            if ui.checkbox(&mut autoplay, "Autoplay new replies").changed() {
                app.send(Command::SetAutoplay(autoplay));
            }
        });
        ui.add_space(6.0);
        let capture = if app.hotkeys.capture_label == "blocked" {
            "Global capture shortcut is blocked. Use the button, or just copy — watch is enough.".to_string()
        } else {
            format!(
                "{} reads the clipboard. {} brings Echo forward.",
                app.hotkeys.capture_label, app.hotkeys.show_label
            )
        };
        ui.label(RichText::new(capture).size(12.0).color(MUTED));
    });
}

fn paste_card(ui: &mut egui::Ui, app: &mut EchoApp) {
    egui::CollapsingHeader::new("Paste manually")
        .default_open(false)
        .show(ui, |ui| {
            ui.add(
                egui::TextEdit::multiline(&mut app.paste)
                    .hint_text("Paste a Cursor reply")
                    .desired_width(ui.available_width())
                    .desired_rows(5),
            );
            ui.add_space(8.0);
            if ui.button("Listen").clicked() {
                let text = std::mem::take(&mut app.paste);
                if text.trim().is_empty() {
                    app.toast = Some((Instant::now(), "Paste a reply first.".into()));
                } else {
                    app.send(Command::CaptureText { text, play: true });
                }
            }
        });
}

fn replies(ui: &mut egui::Ui, app: &mut EchoApp) {
    if app.snapshot.replies.is_empty() {
        card(ui, |ui| {
            ui.vertical_centered(|ui| {
                ui.add_space(28.0);
                ui.label(RichText::new("Waiting for the next Agent reply").strong().size(18.0));
                ui.add_space(6.0);
                ui.label(
                    RichText::new("Connect Cursor, copy a reply, or keep chatting. Echo picks it up in this window — no browser tab and no localhost bridge.")
                        .color(MUTED),
                );
                ui.add_space(28.0);
            });
        });
        return;
    }

    let replies = app.snapshot.replies.clone();
    let player = app.snapshot.player.clone();
    let settings = app.snapshot.settings.clone();
    for reply in replies {
        let doc = build_speakable(
            &reply.text,
            SpeakOptions {
                skip_code: settings.skip_code,
                skip_urls: settings.skip_urls,
            },
        );
        let active = player.reply_id.as_deref() == Some(reply.id.as_str());
        card(ui, |ui| {
            ui.horizontal(|ui| {
                let source = match reply.source {
                    Source::Cursor => "Cursor",
                    Source::Manual => "Manual",
                };
                ui.label(
                    RichText::new(format!("{source} · {}", format_time(reply.created_at)))
                        .size(12.0)
                        .color(MUTED),
                );
                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if active && player.status == PlayStatus::Playing {
                        if ui.button("Pause").clicked() {
                            app.send(Command::Pause);
                        }
                    } else if active && player.status == PlayStatus::Paused {
                        if ui.button("Resume").clicked() {
                            app.send(Command::Resume);
                        }
                    } else if ui.button("Play").clicked() {
                        app.send(Command::Play {
                            id: reply.id.clone(),
                            start: 0,
                        });
                    }
                });
            });
            ui.add_space(8.0);
            for (index, chunk) in doc.chunks.iter().enumerate() {
                let current = active && player.chunk == index && player.status != PlayStatus::Idle;
                let color = if current { AMBER } else { TEXT };
                let response = ui.add(
                    egui::Label::new(RichText::new(chunk).color(color).size(14.5)).sense(Sense::click()),
                );
                if response.clicked() {
                    app.send(Command::Play {
                        id: reply.id.clone(),
                        start: index,
                    });
                }
                ui.add_space(4.0);
            }
            if doc.skipped_code_blocks > 0 {
                ui.label(
                    RichText::new(format!(
                        "{} code block{} skipped",
                        doc.skipped_code_blocks,
                        if doc.skipped_code_blocks == 1 { "" } else { "s" }
                    ))
                    .size(11.0)
                    .color(MUTED),
                );
            }
        });
        ui.add_space(10.0);
    }
}

fn dock(ui: &mut egui::Ui, snapshot: &Snapshot, commands: &Sender<Command>) {
    ui.horizontal(|ui| {
        let playing = snapshot.player.status == PlayStatus::Playing;
        let label = match snapshot.player.status {
            PlayStatus::Loading => "Loading",
            PlayStatus::Playing => "Pause",
            PlayStatus::Paused => "Resume",
            PlayStatus::Idle => "Play",
        };
        if ui
            .add(
                egui::Button::new(RichText::new(label).color(Color32::BLACK).strong())
                    .fill(AMBER)
                    .min_size(Vec2::new(88.0, 32.0)),
            )
            .clicked()
        {
            toggle_play(commands, snapshot);
        }
        if ui.button("Prev").clicked() {
            let _ = commands.send(Command::Prev);
        }
        if ui.button("Next").clicked() {
            let _ = commands.send(Command::Next);
        }
        if ui.button("Stop").clicked() {
            let _ = commands.send(Command::Stop);
        }
        ui.label(
            RichText::new(if snapshot.player.chunk_count == 0 {
                "0 / 0".into()
            } else {
                format!(
                    "{} / {}",
                    snapshot.player.chunk + 1,
                    snapshot.player.chunk_count
                )
            })
            .color(MUTED),
        );
        if snapshot.player.status == PlayStatus::Loading {
            ui.spinner();
        }
        let _ = playing;
    });
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        ui.label(RichText::new("Voice").color(MUTED));
        let mut voice = snapshot.settings.voice.clone();
        egui::ComboBox::from_id_salt("voice")
            .selected_text(crate::model::voice_label(&voice))
            .show_ui(ui, |ui| {
                for (id, name) in VOICES {
                    ui.selectable_value(&mut voice, (*id).to_string(), *name);
                }
            });
        if voice != snapshot.settings.voice {
            let _ = commands.send(Command::SetVoice(voice));
        }

        ui.add_space(12.0);
        ui.label(RichText::new("Speed").color(MUTED));
        let mut rate = snapshot.settings.rate;
        if ui
            .add(egui::Slider::new(&mut rate, 0.75..=1.4).fixed_decimals(2))
            .changed()
        {
            let _ = commands.send(Command::SetRate(rate));
        }

        let mut skip_code = snapshot.settings.skip_code;
        if ui.checkbox(&mut skip_code, "Skip code").changed() {
            let _ = commands.send(Command::SetSkip {
                code: skip_code,
                urls: snapshot.settings.skip_urls,
            });
        }
        let mut skip_urls = snapshot.settings.skip_urls;
        if ui.checkbox(&mut skip_urls, "Skip URLs").changed() {
            let _ = commands.send(Command::SetSkip {
                code: snapshot.settings.skip_code,
                urls: skip_urls,
            });
        }
    });
}

fn toggle_play(commands: &Sender<Command>, snapshot: &Snapshot) {
    match snapshot.player.status {
        PlayStatus::Playing => {
            let _ = commands.send(Command::Pause);
        }
        PlayStatus::Paused => {
            let _ = commands.send(Command::Resume);
        }
        PlayStatus::Loading => {}
        PlayStatus::Idle => {
            if let Some(id) = snapshot
                .player
                .reply_id
                .clone()
                .or_else(|| snapshot.replies.first().map(|reply| reply.id.clone()))
            {
                let _ = commands.send(Command::Play { id, start: 0 });
            }
        }
    }
}

fn status_badge(ui: &mut egui::Ui, snapshot: &Snapshot) {
    let (text, fill, stroke) = if snapshot.cursor.checking {
        (
            "Checking Cursor",
            Color32::from_rgb(24, 24, 24),
            Color32::from_rgb(64, 64, 64),
        )
    } else if snapshot.cursor.connected {
        (
            "Cursor connected",
            Color32::from_rgb(6, 40, 28),
            Color32::from_rgb(16, 185, 129),
        )
    } else {
        (
            "Desktop ready",
            Color32::from_rgb(24, 24, 24),
            Color32::from_rgb(82, 82, 82),
        )
    };
    Frame::NONE
        .fill(fill)
        .stroke(Stroke::new(1.0, stroke))
        .corner_radius(CornerRadius::same(20))
        .inner_margin(Margin::symmetric(10, 4))
        .show(ui, |ui| {
            ui.label(RichText::new(text).size(12.0).color(Color32::from_rgb(228, 228, 228)));
        });
}

fn mark(ui: &mut egui::Ui) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(32.0), Sense::hover());
    ui.painter()
        .rect_filled(rect, CornerRadius::same(8), AMBER);
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        "E",
        FontId::proportional(16.0),
        Color32::BLACK,
    );
}

fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    Frame::NONE
        .fill(CARD)
        .stroke(Stroke::new(1.0, Color32::from_rgb(38, 38, 38)))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::same(14))
        .show(ui, add);
}

fn format_time(ms: u64) -> String {
    chrono::DateTime::from_timestamp_millis(ms as i64)
        .map(|when| when.with_timezone(&chrono::Local).format("%I:%M %p").to_string())
        .unwrap_or_else(|| "now".into())
}

fn apply_theme(ctx: &egui::Context) {
    let mut visuals = egui::Visuals::dark();
    visuals.override_text_color = Some(TEXT);
    visuals.widgets.inactive.bg_fill = Color32::from_rgb(28, 28, 28);
    visuals.widgets.hovered.bg_fill = Color32::from_rgb(40, 40, 40);
    visuals.widgets.active.bg_fill = Color32::from_rgb(50, 50, 50);
    visuals.selection.bg_fill = Color32::from_rgb(88, 64, 14);
    visuals.window_fill = BG;
    visuals.panel_fill = BG;
    visuals.extreme_bg_color = Color32::from_rgb(18, 18, 18);
    ctx.set_visuals(visuals);
    ctx.set_pixels_per_point(1.15);
}

const BG: Color32 = Color32::from_rgb(10, 10, 10);
const CARD: Color32 = Color32::from_rgb(18, 18, 18);
const TEXT: Color32 = Color32::from_rgb(245, 245, 245);
const MUTED: Color32 = Color32::from_rgb(163, 163, 163);
const AMBER: Color32 = Color32::from_rgb(251, 191, 36);
