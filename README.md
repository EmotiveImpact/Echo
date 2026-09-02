# Echo

A SwiftUI menu-bar Mac app that reads Cursor Agent replies out loud.

Copy a reply in Cursor. Echo speaks it. No project skill, no type-`ski` handshake, no Cursor Connect, no browser tab.

Download the latest Mac build from **[Releases](https://github.com/EmotiveImpact/Echo/releases)**.

- Apple Silicon: `Echo-0.3.3-arm64-mac.zip`
- Intel Mac: `Echo-0.3.3-x64-mac.zip`

Unzip into **Downloads** so the app is `~/Downloads/Echo/Echo.app`. macOS will say the unsigned app is **damaged**. That is Gatekeeper, not a bad binary. Double-click **Open Echo.command**, or run:

```bash
xattr -cr ~/Downloads/Echo/Echo.app
open ~/Downloads/Echo/Echo.app
```

Echo lives in the menu bar. Click the ear / waveform icon.

## Do you need to sign it?

Not for your own Mac in development. This repo ships **unsigned** zips, same as before.

- First open: the two commands above. After that, Echo launches normally.
- A paid Apple Developer account ($99/year) is only required if you want notarized double-click-without-Terminal for other people. Skip that for now.

You do **not** need Xcode installed to use the downloaded app.

## Copy, not a skill

Heyski / SKI wires Cursor through a project skill and a `ski` handshake. Echo does not.

Trigger is **Copy**:

| Mode | What it speaks |
| --- | --- |
| **Cursor** (default) | Copies made while Cursor is the frontmost app |
| **Apps** | Copies from the apps you pick |
| **All** | Any qualifying copy on the pasteboard |

Cursor is detected by bundle id (`com.todesktop.230313mzl4w4u92`, `com.anysphere.cursor`) or a name that starts with Cursor.

Short snippets, bare URLs, and token-looking strings are ignored. Fenced code is skipped. **Read clipboard** speaks the current pasteboard even if the filter would skip the source app.

## Free voice API

Echo uses Microsoft Edge Read Aloud (the same unofficial neural voices as before: Aria, Jenny, Andrew, …). There is no sign-in and no API key. A public client token is sent to `speech.platform.bing.com`.

There is **no published free-tier minute or hour quota**. It is not a metered “X minutes/month” product. Light daily use often just keeps working. Hammer it and you can get throttled (HTTP 429). Microsoft can rotate tokens and the voices can break without notice.

If you need a contract and a number, that is Azure Speech (for example F0, about 5 million characters/month), not this path. Echo does not require Azure today.

## Use it

1. Quit older Hearback / Echo builds.
2. Unzip so the app is `~/Downloads/Echo/Echo.app`.
3. Run the `xattr` commands above.
4. Leave **Cursor** selected in the panel.
5. Copy a reply in Cursor. Autoplay starts speaking.

Settings live in `~/.echo/settings.json`.

## Build from source (Mac)

Needs Xcode 15+ and [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```bash
brew install xcodegen
git clone https://github.com/EmotiveImpact/Echo.git
cd Echo
bash macos/build.sh arm64
open macos/DerivedData/Build/Products/Release/Echo.app
```

CI builds unsigned arm64 and Intel zips on `macos-15` when you push a `v*` tag.

The older Rust/egui app remains under `src/` and is not what the Mac release builds anymore.
