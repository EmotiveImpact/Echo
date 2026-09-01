# Hearback

Click play on a Cursor agent reply and hear it back — the same interaction ChatGPT and Claude give you, without waiting for Cursor to ship a speaker icon on chat bubbles.

Cursor does not expose a public API for injecting controls into Agent chat. Hearback sits in Cursor's Browser panel, captures completed Agent messages through the supported `afterAgentResponse` hook, and plays real MP3 audio in the page.

## How to use it with Cursor

1. Keep Hearback open at `http://localhost:3000` in Cursor's Browser tab.
2. Continue using Agent mode normally.
3. When an Agent message completes, `.cursor/hooks/capture-response.mjs` stores the real response locally.
4. Hearback discovers it automatically and enables **Play**.
5. Click **Play**. The spoken sentence highlights as it plays.

Manual paste remains available as a fallback. Code fences are skipped by default so you do not hear punctuation soup. Speed, voice, pause, and skip-sentence sit in the bar at the bottom.

## Why this is not a Cursor plugin

| Approach | Reality |
| --- | --- |
| Play button on Cursor bubbles | Cursor would have to ship this. There is no chat contribution API. |
| MCP `speak` tools | The model must call a tool and duplicate the final response. |
| Hearback | A supported response hook captures the message; the adjacent Browser panel supplies Play. |

This works with Cursor Agent Chat and Cmd+K. Project hooks are supported by writable Cloud Agents.

## Use in Cursor's Agent Window

No VSIX is needed. Start a fresh Cloud Agent from the latest repository revision. The repository-managed environment automatically:

- runs `npm ci`;
- starts `npm run dev` on port 3000;
- exposes the Hearback Browser preview; and
- loads `.cursor/hooks.json`.

Open `http://localhost:3000` in the Agent Window's Browser tab. The response that completes the current turn appears in Hearback.

## Optional classic IDE extension

The VSIX is only for Cursor's classic VS Code-style IDE, not the Agent Window. Build it with:

```bash
npm run package:vsix
```

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Playback currently uses neural voices through `/api/tts` (no API key). The machine running Next.js needs outbound access to Microsoft Edge TTS.

```bash
npm test
npm run lint
npm run build
npm run package:vsix
```

## Keyboard

- <kbd>Space</kbd> play / pause
- <kbd>⌘</kbd><kbd>Enter</kbd> or <kbd>Ctrl</kbd><kbd>Enter</kbd> listen to the paste
- <kbd>←</kbd> <kbd>→</kbd> skip a sentence
