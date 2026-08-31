import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildSpeakable, markdownToSpeech, splitSentences } from "./speakable.ts"

describe("markdownToSpeech", () => {
  it("strips markdown and keeps the words", () => {
    const spoken = markdownToSpeech(
      "Hit **play** on the [reply](https://example.com) and hear `speechSynthesis`.",
      { skipCode: true, skipUrls: true }
    )
    assert.equal(
      spoken,
      "Hit play on the reply and hear speechSynthesis."
    )
  })

  it("replaces raw URLs when skipUrls is on", () => {
    const spoken = markdownToSpeech("See https://cursor.com/docs for this.", {
      skipCode: true,
      skipUrls: true,
    })
    assert.equal(spoken, "See link for this.")
  })
})

describe("splitSentences", () => {
  it("splits on sentence boundaries and keeps abbreviations together", () => {
    const parts = splitSentences(
      "Cursor has no public chat API. Use this companion, e.g. paste a reply. Then press play."
    )
    assert.deepEqual(parts, [
      "Cursor has no public chat API.",
      "Use this companion, e.g. paste a reply.",
      "Then press play.",
    ])
  })
})

describe("buildSpeakable", () => {
  it("skips fenced code and still speaks the prose", () => {
    const doc = buildSpeakable(
      [
        "Paste the reply, then hit play.",
        "",
        "```ts",
        "speechSynthesis.speak(new SpeechSynthesisUtterance('hi'))",
        "```",
        "",
        "Code is skipped so you do not hear punctuation soup.",
      ].join("\n"),
      { skipCode: true, skipUrls: true }
    )

    assert.equal(doc.skippedCodeBlocks, 1)
    assert.ok(doc.blocks.some((block) => block.kind === "code" && block.skipped))
    assert.deepEqual(doc.chunks, [
      "Paste the reply, then hit play.",
      "Code is skipped so you do not hear punctuation soup.",
    ])
  })

  it("returns an empty document for blank input", () => {
    const doc = buildSpeakable("   \n  ", { skipCode: true, skipUrls: true })
    assert.equal(doc.chunks.length, 0)
    assert.equal(doc.blocks.length, 0)
  })
})
