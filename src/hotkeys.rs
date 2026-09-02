use global_hotkey::hotkey::{Code, HotKey, Modifiers};
use global_hotkey::{GlobalHotKeyEvent, GlobalHotKeyManager, HotKeyState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyAction {
    Capture,
    Show,
}

pub struct Hotkeys {
    _manager: Option<GlobalHotKeyManager>,
    capture: Option<HotKey>,
    show: Option<HotKey>,
    pub capture_label: String,
    pub show_label: String,
}

impl Hotkeys {
    pub fn new() -> Self {
        let manager = GlobalHotKeyManager::new().ok();
        let mut capture = None;
        let mut show = None;
        let mut capture_label = "blocked".to_string();
        let mut show_label = "blocked".to_string();

        if let Some(manager) = manager.as_ref() {
            let capture_candidates = [
                (super_shift(), Code::KeyH, shortcut_name("H", true, false)),
                (super_alt(), Code::KeyH, shortcut_name("H", false, true)),
                (ctrl_shift(), Code::Period, shortcut_name(".", true, false)),
            ];
            for (mods, code, label) in capture_candidates {
                let hotkey = HotKey::new(Some(mods), code);
                if manager.register(hotkey).is_ok() {
                    capture = Some(hotkey);
                    capture_label = label;
                    break;
                }
            }

            let show_candidates = [
                (super_shift(), Code::KeyO, shortcut_name("O", true, false)),
                (super_alt(), Code::KeyO, shortcut_name("O", false, true)),
                (ctrl_shift(), Code::KeyO, shortcut_name("O", true, false)),
            ];
            for (mods, code, label) in show_candidates {
                let hotkey = HotKey::new(Some(mods), code);
                if manager.register(hotkey).is_ok() {
                    show = Some(hotkey);
                    show_label = label;
                    break;
                }
            }
        }

        Self {
            _manager: manager,
            capture,
            show,
            capture_label,
            show_label,
        }
    }

    pub fn poll(&self) -> Option<HotkeyAction> {
        let event = GlobalHotKeyEvent::receiver().try_recv().ok()?;
        if event.state != HotKeyState::Pressed {
            return None;
        }
        if self.capture.is_some_and(|hotkey| hotkey.id == event.id) {
            return Some(HotkeyAction::Capture);
        }
        if self.show.is_some_and(|hotkey| hotkey.id == event.id) {
            return Some(HotkeyAction::Show);
        }
        None
    }
}

fn super_shift() -> Modifiers {
    Modifiers::SUPER | Modifiers::SHIFT
}

fn super_alt() -> Modifiers {
    Modifiers::SUPER | Modifiers::ALT
}

fn ctrl_shift() -> Modifiers {
    Modifiers::CONTROL | Modifiers::SHIFT
}

fn shortcut_name(key: &str, shift: bool, alt: bool) -> String {
    let command = if cfg!(target_os = "macos") { "⌘" } else { "Ctrl" };
    let mut out = command.to_string();
    if alt {
        out.push(if cfg!(target_os = "macos") { '⌥' } else { '+' });
        if !cfg!(target_os = "macos") {
            out.push_str("Alt");
        }
    }
    if shift {
        out.push('⇧');
    }
    if !cfg!(target_os = "macos") && !out.ends_with('+') {
        out.push('+');
    }
    out.push_str(key);
    out
}
