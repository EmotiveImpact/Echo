/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require("node:assert/strict")
const { readFile, rm } = require("node:fs/promises")
const Module = require("node:module")
const path = require("node:path")

const extensionPath = path.resolve("extension")
const storagePath = "/tmp/hearback-extension-activation"
const commands = new Map()
const registeredPlugins = []
const opened = []
const state = new Map()

const disposable = { dispose() {} }
const output = {
  append() {},
  appendLine() {},
  dispose() {},
}
const status = {
  name: "",
  text: "",
  tooltip: "",
  command: "",
  show() {},
  dispose() {},
}

const vscode = {
  StatusBarAlignment: { Right: 2 },
  Uri: {
    parse(value) {
      return { toString: () => value }
    },
  },
  commands: {
    registerCommand(name, handler) {
      commands.set(name, handler)
      return disposable
    },
    async executeCommand(name, ...args) {
      opened.push([name, ...args])
    },
  },
  cursor: {
    plugins: {
      registerPath(pluginPath) {
        registeredPlugins.push(pluginPath)
      },
      unregisterPath() {},
    },
  },
  env: {
    async openExternal(uri) {
      opened.push(["external", uri.toString()])
    },
  },
  window: {
    createOutputChannel() {
      return output
    },
    createStatusBarItem() {
      return status
    },
    async showErrorMessage(message) {
      throw new Error(message)
    },
    async showInformationMessage() {},
  },
}

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") return vscode
  return originalLoad.call(this, request, parent, isMain)
}

async function main() {
  await rm(storagePath, { recursive: true, force: true })

  const context = {
    extensionPath,
    globalStorageUri: { fsPath: storagePath },
    globalState: {
      get(key) {
        return state.get(key)
      },
      async update(key, value) {
        state.set(key, value)
      },
    },
    subscriptions: {
      push() {},
    },
  }

  const extension = require(
    path.join(extensionPath, "dist", "extension.js")
  )
  await extension.activate(context)

  assert.ok(commands.has("hearback.open"))
  assert.ok(commands.has("hearback.restart"))
  assert.equal(registeredPlugins.length, 1)
  assert.ok(
    opened.some(
      ([command, url]) =>
        command === "simpleBrowser.show" && url === "http://localhost:3000"
    )
  )
  assert.equal(status.text, "$(unmute) Hearback")

  const hooks = JSON.parse(
    await readFile(
      path.join(registeredPlugins[0], "hooks", "hooks.json"),
      "utf8"
    )
  )
  const hook = hooks.hooks.afterAgentResponse[0]
  assert.match(hook.command, /capture-response\.mjs/)
  assert.equal(hook.timeout, 5)

  extension.deactivate()
  await rm(storagePath, { recursive: true, force: true })
  console.log("Extension activation, hook registration, and Browser opening passed.")
}

main().finally(() => {
  Module._load = originalLoad
})
