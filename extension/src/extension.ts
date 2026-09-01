import { spawn, type ChildProcess } from "node:child_process"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import * as vscode from "vscode"

const HEARBACK_URL = "http://localhost:3000"
const HEALTH_URL = `${HEARBACK_URL}/api/health`

let server: ChildProcess | null = null
let pluginPath: string | null = null
let output: vscode.OutputChannel
let status: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel("Hearback")
  status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    90
  )
  status.name = "Hearback"
  status.text = "$(loading~spin) Hearback"
  status.tooltip = "Starting the Hearback player"
  status.command = "hearback.open"
  status.show()

  context.subscriptions.push(output, status)
  context.subscriptions.push(
    vscode.commands.registerCommand("hearback.open", async () => {
      if (await ensureServer(context)) {
        await openPlayer()
      }
    }),
    vscode.commands.registerCommand("hearback.restart", async () => {
      stopServer()
      if (await ensureServer(context)) {
        void vscode.window.showInformationMessage(
          "Hearback restarted on localhost:3000."
        )
        await openPlayer()
      }
    })
  )

  try {
    await registerResponseHook(context)
  } catch (error) {
    report("Could not register the Cursor response hook.", error)
  }

  if (!(await ensureServer(context))) return

  const hasOpened = context.globalState.get<boolean>("openedHearback")
  if (!hasOpened) {
    await context.globalState.update("openedHearback", true)
    await openPlayer()
  }
}

export function deactivate() {
  if (pluginPath) {
    try {
      vscode.cursor?.plugins.unregisterPath(pluginPath)
    } catch {
      // Cursor may already be shutting down.
    }
  }
  stopServer()
}

async function registerResponseHook(context: vscode.ExtensionContext) {
  if (!vscode.cursor?.plugins) {
    throw new Error(
      "This editor does not expose Cursor's plugin registration API."
    )
  }

  const root = path.join(context.globalStorageUri.fsPath, "cursor-plugin")
  const hooksDir = path.join(root, "hooks")
  const script = path.join(hooksDir, "capture-response.mjs")
  const bundledScript = path.join(
    context.extensionPath,
    "assets",
    "capture-response.mjs"
  )

  await mkdir(hooksDir, { recursive: true })
  await copyFile(bundledScript, script)
  await writeFile(
    path.join(hooksDir, "hooks.json"),
    JSON.stringify(
      {
        version: 1,
        hooks: {
          afterAgentResponse: [
            {
              command: hookCommand(script),
              timeout: 5,
            },
          ],
        },
      },
      null,
      2
    ),
    "utf8"
  )

  pluginPath = root
  vscode.cursor.plugins.registerPath(root)
  output.appendLine(`Registered Cursor response hook from ${root}`)
}

function hookCommand(script: string) {
  const executable = process.execPath
  if (process.platform === "win32") {
    return `set "ELECTRON_RUN_AS_NODE=1" && "${escapeWindows(executable)}" "${escapeWindows(script)}"`
  }
  return `ELECTRON_RUN_AS_NODE=1 ${quoteShell(executable)} ${quoteShell(script)}`
}

async function ensureServer(context: vscode.ExtensionContext) {
  if (await isHealthy()) {
    markReady()
    output.appendLine("Using Hearback already running on localhost:3000.")
    return true
  }

  status.text = "$(loading~spin) Hearback"
  status.tooltip = "Starting the Hearback player"

  const companion = path.join(context.extensionPath, "companion")
  const entry = path.join(companion, "server.js")
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    PORT: "3000",
    NODE_ENV: "production",
  }

  output.appendLine(`Starting ${entry}`)
  server = spawn(process.execPath, [entry], {
    cwd: companion,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  server.stdout?.on("data", (chunk) => output.append(chunk.toString()))
  server.stderr?.on("data", (chunk) => output.append(chunk.toString()))
  server.on("exit", (code, signal) => {
    output.appendLine(`Hearback server exited (${code ?? signal ?? "unknown"}).`)
    server = null
  })
  server.on("error", (error) => report("Hearback could not start.", error))

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(250)
    if (await isHealthy()) {
      markReady()
      return true
    }
    if (!server) break
  }

  status.text = "$(error) Hearback"
  status.tooltip = "Hearback could not start on localhost:3000"
  void vscode.window.showErrorMessage(
    "Hearback could not start on localhost:3000. Run “Hearback: Restart Local Player” and check the Hearback output."
  )
  return false
}

async function isHealthy() {
  try {
    const response = await fetch(HEALTH_URL, {
      signal: AbortSignal.timeout(1200),
      cache: "no-store",
    })
    if (!response.ok) return false
    const body = (await response.json()) as { app?: string }
    return body.app === "hearback"
  } catch {
    return false
  }
}

function markReady() {
  status.text = "$(unmute) Hearback"
  status.tooltip = "Open Hearback beside Cursor Agent"
}

async function openPlayer() {
  try {
    await vscode.commands.executeCommand("simpleBrowser.show", HEARBACK_URL)
  } catch {
    await vscode.env.openExternal(vscode.Uri.parse(HEARBACK_URL))
  }
}

function stopServer() {
  if (!server) return
  server.kill()
  server = null
}

function report(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  output.appendLine(`${message} ${detail}`)
  void vscode.window.showErrorMessage(`${message} ${detail}`)
}

function quoteShell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function escapeWindows(value: string) {
  return value.replaceAll('"', '""')
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
