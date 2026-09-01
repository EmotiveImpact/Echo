import { readFile } from "node:fs/promises"

import type { SavedReply } from "@/lib/storage"

const EVENT_FILE =
  process.env.HEARBACK_RESPONSE_FILE ?? "/tmp/hearback-responses.jsonl"

export async function readCursorResponses(): Promise<SavedReply[]> {
  let contents: string
  try {
    contents = await readFile(EVENT_FILE, "utf8")
  } catch (error) {
    if (isMissingFile(error)) return []
    throw error
  }

  const byGeneration = new Map<string, SavedReply>()

  for (const line of contents.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Partial<SavedReply>
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.text !== "string" ||
        typeof parsed.createdAt !== "number"
      ) {
        continue
      }

      byGeneration.set(parsed.id, {
        id: parsed.id,
        text: parsed.text,
        createdAt: parsed.createdAt,
        source: "cursor",
      })
    } catch {
      // Ignore a partial final line if a hook write is still finishing.
    }
  }

  return [...byGeneration.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40)
}

function isMissingFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}
