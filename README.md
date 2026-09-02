# Echo

A native Mac app that reads Cursor Agent replies out loud.

No Electron. No Next.js. No `localhost:3000` bridge. One Rust binary.

Download the latest Mac build from **[Releases](https://github.com/EmotiveImpact/Echo/releases)**.

- Apple Silicon: `Echo-0.2.2-arm64-mac.zip`
- Intel Mac: `Echo-0.2.2-x64-mac.zip`

Unzip into **Downloads**. macOS will say the unsigned app is **damaged**. That is Gatekeeper. Double-click **Open Echo.command**, or run:

```bash
xattr -cr ~/Downloads/Echo.app
open ~/Downloads/Echo.app
```

## What it does

- Plays Cursor replies with neural voices (Aria and friends) through Edge TTS.
- **Connect Cursor** opens the official browser sign-in and mints an API key.
- Watches the clipboard, so copying a reply is enough.
- Registers a real OS hotkey (`⌘⇧H`, or `⌘⌥H` if the first combo is taken).
- Still reads `~/.echo/responses.jsonl` from the repo hook, and the older `~/.hearback` file if it exists.

## Use it

1. Quit Hearback. Drop `Echo.app` in `~/Downloads`.
2. Run the two commands above.
3. Click **Connect Cursor**. Sign in in the browser. Echo mints the API key, same as before.
4. Keep chatting. When a run finishes, Echo speaks it if Autoplay is on.
5. Or copy a reply. Clipboard watch picks it up. **Read clipboard** is the fallback.

Settings and the API key live in `~/.echo`.

## Build from source

```bash
git clone https://github.com/EmotiveImpact/Echo.git
cd Echo
cargo test
cargo run --release
```

Needs Rust 1.88+. On Linux, install `libasound2-dev` and the usual X11/Wayland headers.

The binary is `echo-desktop` so it does not shadow `/bin/echo`. The window title and Mac app name are **Echo**.

## Keyboard

- `Space` play / pause
- `←` `→` skip a sentence
- `⌘⇧H` read clipboard (when Echo is focused, and globally if macOS allows it)
- `⌘⇧O` bring Echo forward

## Why this is not a Cursor plugin

Cursor does not expose a play button on chat bubbles. Echo sits next to Cursor, captures finished replies, and speaks them.
