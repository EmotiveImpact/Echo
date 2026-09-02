import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  prettyAccelerator,
  shouldAutoCaptureClipboard,
} from "./clipboard-capture.ts"

describe("shouldAutoCaptureClipboard", () => {
  it("captures a long prose reply that just appeared", () => {
    assert.equal(
      shouldAutoCaptureClipboard(
        "Hearback should pick this sentence up automatically once you copy it from Cursor.",
        ""
      ),
      true
    )
  })

  it("ignores the same text it already saw", () => {
    const text =
      "Hearback should pick this sentence up automatically once you copy it from Cursor."
    assert.equal(shouldAutoCaptureClipboard(text, text), false)
  })

  it("ignores short snippets, bare URLs, and token-like strings", () => {
    assert.equal(shouldAutoCaptureClipboard("ok", ""), false)
    assert.equal(shouldAutoCaptureClipboard("https://github.com/EmotiveImpact/Echo", ""), false)
    assert.equal(
      shouldAutoCaptureClipboard("sk-abcdefghijklmnopqrstuvwxyz0123456789abcdefghij", ""),
      false
    )
  })
})

describe("prettyAccelerator", () => {
  it("renders a Mac-style shortcut", () => {
    assert.equal(
      prettyAccelerator("CommandOrControl+Shift+H", true),
      "⌘⇧H"
    )
  })
})
