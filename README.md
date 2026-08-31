# Hearback

Click play on a Cursor agent reply and hear it back — the same interaction ChatGPT and Claude give you, without waiting for Cursor to ship a speaker icon on chat bubbles.

Cursor does not expose a public API for injecting controls into Agent chat. That is why this lives beside the editor instead of inside it. The audio itself is the easy part: the browser already has a speech engine.

## How to use it with Cursor

1. Copy the reply in Cursor.
2. Paste it here (clipboard button, or <kbd>Cmd</kbd>+<kbd>V</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd>).
3. Hit **Listen**. The spoken sentence highlights as it plays.

Code fences are skipped by default so you do not hear punctuation soup. Speed, voice, pause, and skip-sentence sit in the bar at the bottom.

## Why this is not a Cursor plugin

| Approach | Reality |
| --- | --- |
| Play button on Cursor bubbles | Cursor would have to ship this. There is no chat contribution API. |
| MCP `speak` tools | Easy to add, wrong interaction: the agent must call a tool. You still cannot click play on the text. |
| Hearback | Paste any reply, click play, hear it. Same UX as ChatGPT, sitting next to Cursor. |

If Cursor later opens a hook on assistant messages, this player is the component that would go there.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:4317](http://localhost:4317). Use Chrome, Edge, or Safari — they ship a speech engine. Voices stay on your machine; nothing is sent to a TTS API.

```bash
npm test
npm run lint
npm run build
```

## Keyboard

- <kbd>Space</kbd> play / pause
- <kbd>⌘</kbd><kbd>Enter</kbd> or <kbd>Ctrl</kbd><kbd>Enter</kbd> listen to the paste
- <kbd>←</kbd> <kbd>→</kbd> skip a sentence
