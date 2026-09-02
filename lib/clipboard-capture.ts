/** Decide whether a new clipboard value is a real reply, not a password or URL. */
export function shouldAutoCaptureClipboard(
  text: string,
  previous: string
): boolean {
  const trimmed = text.trim()
  const prior = previous.trim()
  if (!trimmed || trimmed === prior) return false
  if (trimmed.length < 48) return false
  if (!/\s/.test(trimmed)) return false
  if (/^https?:\/\/\S+$/i.test(trimmed)) return false
  if (/^[A-Za-z0-9+/_-]{48,}={0,2}$/.test(trimmed)) return false
  return true
}

export function prettyAccelerator(accelerator: string | null, isMac: boolean) {
  if (!accelerator) return null
  const command = isMac ? "⌘" : "Ctrl"
  const option = isMac ? "⌥" : "Alt"
  return accelerator
    .replaceAll("CommandOrControl", command)
    .replaceAll("Command", command)
    .replaceAll("Control", "Ctrl")
    .replaceAll("Alt", option)
    .replaceAll("Shift", "⇧")
    .replaceAll("Plus", "+")
    .replaceAll("+", "")
}
