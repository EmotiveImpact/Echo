# Hearback for Cursor

Hear Cursor Agent responses instead of reading every long message.

## How it works

Hearback registers Cursor's supported `afterAgentResponse` hook, starts a private
companion player on `http://localhost:3000`, and opens that player in Cursor's
Browser view. Completed Agent responses appear automatically.

Use **Hearback: Open Player** from the Command Palette or press:

- macOS: <kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>H</kbd>
- Windows/Linux: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>H</kbd>

The current alpha uses Microsoft neural voices through an unofficial Edge
consumer endpoint. Do not use it for sensitive material. The production provider
will use the official Azure Speech API.
