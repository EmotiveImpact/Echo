export const SAMPLE_REPLY = `The play button in ChatGPT and Claude is a first-party chat UI control. Cursor does not expose a public API to inject buttons into Agent replies, so a true in-chat speaker icon has to come from Cursor itself.

Until that exists, this companion is the same interaction:

1. Copy the reply in Cursor.
2. Paste it here.
3. Hit play, and listen instead of reading the wall of text.

What this player does on purpose:
- Uses your browser's built-in voices. Nothing is sent to a TTS API, and you do not need a key.
- Skips fenced code by default. Hearing \`const value = 1\` read aloud is why people turn speech off.
- Highlights the sentence currently being spoken so you can glance back at the screen without losing your place.

If Cursor later opens a chat contribution point, this same player can sit under each assistant bubble. The hard part is not the audio. The hard part is getting a play button onto Cursor's own transcript.

\`\`\`ts
// This fence is skipped while speaking.
export function playReply(text: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  speechSynthesis.speak(utterance)
}
\`\`\`

Try pause, skip sentence, and speed from the bar at the bottom. Paste your next Cursor reply when you want to hear the real thing.`
