import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_VOICE, resolveVoice, localeFromVoice } from "./neural-voices.ts"

describe("resolveVoice", () => {
  it("keeps a known neural voice", () => {
    assert.equal(resolveVoice("en-GB-RyanNeural"), "en-GB-RyanNeural")
  })

  it("falls back to Aria for unknown values", () => {
    assert.equal(resolveVoice("Microsoft Zira"), DEFAULT_VOICE)
    assert.equal(resolveVoice(null), DEFAULT_VOICE)
  })
})

describe("localeFromVoice", () => {
  it("reads the locale prefix", () => {
    assert.equal(localeFromVoice("en-GB-SoniaNeural"), "en-GB")
  })
})
