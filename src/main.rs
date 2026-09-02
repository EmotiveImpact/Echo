mod app;
mod clipboard;
mod config;
mod cursor;
mod hotkeys;
mod model;
mod speakable;
mod tts;
mod worker;

use eframe::egui;

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([780.0, 900.0])
            .with_min_inner_size([480.0, 620.0])
            .with_title("Echo")
            .with_active(true),
        ..Default::default()
    };
    eframe::run_native(
        "Echo",
        options,
        Box::new(|cc| Ok(Box::new(app::EchoApp::new(cc)))),
    )
}
