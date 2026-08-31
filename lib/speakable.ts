export type BlockKind = "heading" | "paragraph" | "list" | "quote" | "code"

export type Sentence = {
  id: string
  speak: string
  source: string
}

export type Block = {
  id: string
  kind: BlockKind
  sentences: Sentence[]
  skipped: boolean
  note?: string
}

export type SpeakableDoc = {
  blocks: Block[]
  chunks: string[]
  sentenceCount: number
  skippedCodeBlocks: number
}

export type SpeakOptions = {
  skipCode: boolean
  skipUrls: boolean
}

const ABBREVIATIONS = /\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr|Ms|Prof|approx|fig|vs)\./gi

export function buildSpeakable(raw: string, options: SpeakOptions): SpeakableDoc {
  const text = raw.replace(/\r\n/g, "\n").trim()
  if (!text) {
    return { blocks: [], chunks: [], sentenceCount: 0, skippedCodeBlocks: 0 }
  }

  const segments = splitFences(text)
  const blocks: Block[] = []
  let skippedCodeBlocks = 0
  let counter = 0
  const nextId = (prefix: string) => `${prefix}-${++counter}`

  for (const segment of segments) {
    if (segment.type === "code") {
      skippedCodeBlocks += 1
      if (options.skipCode) {
        blocks.push({
          id: nextId("code"),
          kind: "code",
          sentences: [],
          skipped: true,
          note: codeFenceNote(segment.lang, segment.body),
        })
        continue
      }

      const spoken = speakCode(segment.body)
      blocks.push({
        id: nextId("code"),
        kind: "code",
        sentences: spoken
          ? [{ id: nextId("s"), speak: spoken, source: segment.body.trim() }]
          : [],
        skipped: !spoken,
        note: spoken ? undefined : "Empty code block",
      })
      continue
    }

    const proseBlocks = splitProse(segment.body)
    for (const prose of proseBlocks) {
      const cleanedSource = prose.source
      const speakBase = markdownToSpeech(cleanedSource, options)
      if (!speakBase.trim()) continue

      const sentences = splitSentences(speakBase).map((speak) => ({
        id: nextId("s"),
        speak: capChunk(speak),
        source: speak,
      }))

      if (sentences.length === 0) continue

      blocks.push({
        id: nextId(prose.kind),
        kind: prose.kind,
        sentences,
        skipped: false,
      })
    }
  }

  const chunks = blocks.flatMap((block) =>
    block.skipped ? [] : block.sentences.map((sentence) => sentence.speak)
  )

  return {
    blocks,
    chunks,
    sentenceCount: chunks.length,
    skippedCodeBlocks,
  }
}

function splitFences(text: string): Array<
  | { type: "prose"; body: string }
  | { type: "code"; lang: string; body: string }
> {
  const parts: Array<
    | { type: "prose"; body: string }
    | { type: "code"; lang: string; body: string }
  > = []
  const fence = /```([^\n]*)\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = fence.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "prose", body: text.slice(last, match.index) })
    }
    parts.push({
      type: "code",
      lang: match[1]?.trim() ?? "",
      body: match[2] ?? "",
    })
    last = match.index + match[0].length
  }

  if (last < text.length) {
    parts.push({ type: "prose", body: text.slice(last) })
  }

  return parts
}

function splitProse(body: string): Array<{ kind: BlockKind; source: string }> {
  return body
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (/^#{1,6}\s/.test(chunk)) {
        return { kind: "heading" as const, source: chunk.replace(/^#{1,6}\s+/, "") }
      }
      if (/^>\s?/m.test(chunk)) {
        return {
          kind: "quote" as const,
          source: chunk.replace(/^>\s?/gm, ""),
        }
      }
      if (/^(\s*[-*+]|\s*\d+\.)\s/m.test(chunk)) {
        return { kind: "list" as const, source: chunk }
      }
      return { kind: "paragraph" as const, source: chunk }
    })
}

export function markdownToSpeech(input: string, options: SpeakOptions): string {
  let text = input

  text = text.replace(/^\s*[-*+]\s+/gm, "")
  text = text.replace(/^\s*\d+\.\s+/gm, "")
  text = text.replace(/!\[[^\]]*]\([^)]*\)/g, "")
  text = text.replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
  text = text.replace(/`([^`]+)`/g, "$1")
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1")
  text = text.replace(/__([^_]+)__/g, "$1")
  text = text.replace(/\*([^*]+)\*/g, "$1")
  text = text.replace(/_([^_]+)_/g, "$1")
  text = text.replace(/^#{1,6}\s+/gm, "")
  text = text.replace(/^>\s?/gm, "")
  text = text.replace(/^\|.*\|$/gm, "")
  text = text.replace(/^[-*]{3,}$/gm, "")

  if (options.skipUrls) {
    text = text.replace(/https?:\/\/\S+/gi, "link")
  }

  text = text.replace(/<!--[\s\S]*?-->/g, "")
  text = text.replace(/[ \t]+\n/g, "\n")
  text = text.replace(/\n+/g, " ")
  text = text.replace(/\s{2,}/g, " ")
  return text.trim()
}

export function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const placeholders: string[] = []
  const masked = trimmed.replace(ABBREVIATIONS, (match) => {
    const token = `§ABBREV${placeholders.length}§`
    placeholders.push(match)
    return token
  })

  const pieces = masked
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => wrapLong(piece, 280))

  return pieces.map((piece) =>
    placeholders.reduce(
      (acc, original, index) => acc.replace(`§ABBREV${index}§`, original),
      piece
    )
  )
}

function wrapLong(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const words = text.split(" ")
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > max && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

function capChunk(text: string): string {
  return wrapLong(text, 280).join(" ")
}

function speakCode(body: string): string {
  const compact = body.trim()
  if (!compact) return ""
  const lines = compact.split("\n").filter((line) => line.trim())
  if (lines.length > 12 || compact.length > 400) {
    return `Short code sample, ${lines.length} lines.`
  }
  return `Code. ${lines.join(". ")}`
}

function codeFenceNote(lang: string, body: string): string {
  const lines = body.split("\n").filter((line) => line.trim()).length
  const label = lang ? `${lang} code` : "Code"
  return `${label} skipped, ${lines} line${lines === 1 ? "" : "s"}`
}
