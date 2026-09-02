import { spawn, type ChildProcess } from "node:child_process"
import { readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { Agent, Cursor } from "@cursor/sdk"
import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  shell,
  Tray,
} from "electron"

const APP_URL = "http://localhost:3000"
const TERMINAL_STATUSES = new Set([
  "FINISHED",
  "ERROR",
  "CANCELLED",
  "EXPIRED",
  "finished",
  "error",
  "cancelled",
])

type CursorAgent = {
  id: string
  latestRunId?: string
  updatedAt?: string
}

type CursorRun = {
  id: string
  status: string
  result?: string
  updatedAt?: string
}

type CapturedResponse = {
  id: string
  text: string
  createdAt: number
  source: "cursor" | "manual"
}

type AzureCredentials = {
  key: string
  region: string
}

const ALLOWED_VOICES = new Set([
  "en-US-AriaNeural",
  "en-US-JennyNeural",
  "en-US-AndrewNeural",
  "en-US-EmmaNeural",
  "en-US-GuyNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
])

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let server: ChildProcess | null = null
let monitor: ReturnType<typeof setInterval> | null = null
let hookMonitor: ReturnType<typeof setInterval> | null = null
let monitoring = false
let delivered = new Set<string>()
let quitting = false

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on("second-instance", () => showWindow())
}

app.whenReady().then(async () => {
  await loadDelivered()
  registerIpc()
  await ensureServer()
  createWindow()
  createTray()
  registerShortcuts()
  startHookWatch()
  await startMonitoring()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    mainWindow?.hide()
  }
})

app.on("activate", () => showWindow())

app.on("before-quit", () => {
  if (monitor) clearInterval(monitor)
  if (hookMonitor) clearInterval(hookMonitor)
  globalShortcut.unregisterAll()
  server?.kill()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Hearback",
    width: 780,
    height: 900,
    minWidth: 480,
    minHeight: 620,
    backgroundColor: "#0a0a0a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  })

  mainWindow.removeMenu()
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on("ready-to-show", () => mainWindow?.show())
  void mainWindow.loadURL(APP_URL)
}

function createTray() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect width="18" height="18" rx="5" fill="#fbbf24"/><path d="M4 9h2m2-4v8m3-6v4m3-2h1" stroke="#111" stroke-width="1.8" stroke-linecap="round"/></svg>'
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
  )
  tray = new Tray(icon)
  tray.setToolTip("Hearback")
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Hearback", click: () => showWindow() },
      {
        label: "Read Clipboard",
        click: () => captureClipboard(),
      },
      { type: "separator" },
      { label: "Quit", click: () => quitApp() },
    ])
  )
  tray.on("click", () => showWindow())
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+Space", () => showWindow())
  globalShortcut.register("CommandOrControl+Shift+H", () => captureClipboard())
}

function registerIpc() {
  ipcMain.handle("hearback:cursor-status", async () => cursorStatus())
  ipcMain.handle("hearback:cursor-connect", async () => {
    const login = await Cursor.auth.login({
      apiKeyName: "Hearback Desktop",
      apiKeyTtlMs: 1000 * 60 * 60 * 24 * 90,
      openBrowser: async (url) => {
        await shell.openExternal(url)
      },
      store: null,
    })
    await saveApiKey(login.apiKey)
    await startMonitoring(true)
    return {
      status: "connected",
      email: login.email ?? null,
      expiresAtMs: login.apiKeyExpiresAtMs,
    }
  })
  ipcMain.handle("hearback:cursor-disconnect", async () => {
    stopMonitoring()
    await rm(credentialsPath(), { force: true })
    return { status: "disconnected" }
  })
  ipcMain.handle("hearback:read-clipboard", () => captureClipboard())
  ipcMain.handle("hearback:azure-status", async () => ({
    configured: Boolean(await readAzureCredentials()),
  }))
  ipcMain.handle(
    "hearback:azure-save",
    async (_event, credentials: AzureCredentials) => {
      const key = credentials.key.trim()
      const region = credentials.region.trim().toLowerCase()
      if (!key || !/^[a-z0-9-]+$/.test(region)) {
        throw new Error("Enter a valid Azure Speech key and region.")
      }
      await saveEncrypted(
        azureCredentialsPath(),
        JSON.stringify({ key, region })
      )
      return { configured: true }
    }
  )
  ipcMain.handle("hearback:azure-clear", async () => {
    await rm(azureCredentialsPath(), { force: true })
    return { configured: false }
  })
  ipcMain.handle(
    "hearback:tts-synthesize",
    async (_event, text: string, voice: string) => {
      const credentials = await readAzureCredentials()
      if (!credentials) return null
      return synthesizeAzure(text, voice, credentials)
    }
  )
}

async function cursorStatus() {
  const key = await readApiKey()
  if (!key) return { status: "disconnected" }

  try {
    const me = await cursorRequest<{
      userEmail?: string
      apiKeyName?: string
    }>("/v1/me", key)
    return {
      status: "connected",
      email: me.userEmail ?? null,
      apiKeyName: me.apiKeyName ?? "Hearback Desktop",
    }
  } catch {
    return { status: "expired" }
  }
}

async function startMonitoring(runImmediately = false) {
  stopMonitoring()
  const key = await readApiKey()
  if (!key) return

  if (runImmediately) await pollCursor(key)
  monitor = setInterval(() => void pollCursor(key), 20_000)
}

function stopMonitoring() {
  if (monitor) clearInterval(monitor)
  monitor = null
}

async function pollCursor(key: string) {
  if (monitoring) return
  monitoring = true

  try {
    const agents = await listCloudAgents(key)
    for (const agent of agents.slice(0, 8)) {
      const runs = await listAgentRuns(agent.id, key)
      for (const run of runs.slice(0, 4)) {
        if (delivered.has(run.id)) continue
        if (!TERMINAL_STATUSES.has(run.status)) continue

        delivered.add(run.id)
        await saveDelivered()
        const text = run.result?.trim()
        if ((run.status === "FINISHED" || run.status === "finished") && text) {
          emitResponse({
            id: `cursor-api:${run.id}`,
            text,
            createdAt:
              Date.parse(run.updatedAt ?? agent.updatedAt ?? "") || Date.now(),
            source: "cursor",
          })
        }
      }
    }
    mainWindow?.webContents.send("hearback:cursor-error", "")
  } catch (error) {
    if (isSkippableCursorError(error)) {
      mainWindow?.webContents.send("hearback:cursor-error", "")
      return
    }
    mainWindow?.webContents.send("hearback:cursor-error", errorMessage(error))
  } finally {
    monitoring = false
  }
}

async function listCloudAgents(key: string): Promise<CursorAgent[]> {
  try {
    const listed = await Agent.list({
      runtime: "cloud",
      apiKey: key,
      limit: 20,
      includeArchived: true,
    })
    return listed.items.map((agent) => ({
      id: agent.agentId,
      updatedAt: agent.lastModified
        ? new Date(agent.lastModified).toISOString()
        : undefined,
    }))
  } catch {
    const data = await cursorRequest<{ items?: CursorAgent[] }>(
      "/v1/agents?limit=20&includeArchived=true",
      key
    )
    return data.items ?? []
  }
}

async function listAgentRuns(agentId: string, key: string): Promise<CursorRun[]> {
  try {
    const listed = await Agent.listRuns(agentId, {
      runtime: "cloud",
      apiKey: key,
      limit: 5,
    })
    return listed.items.map((run) => ({
      id: run.id,
      status: run.status,
      result: run.result,
      updatedAt: run.createdAt ? new Date(run.createdAt).toISOString() : undefined,
    }))
  } catch (error) {
    if (isSkippableCursorError(error)) return []
    try {
      const data = await cursorRequest<{ items?: CursorRun[] }>(
        `/v1/agents/${encodeURIComponent(agentId)}/runs?limit=5`,
        key
      )
      return data.items ?? []
    } catch (fallbackError) {
      if (isSkippableCursorError(fallbackError)) return []
      throw fallbackError
    }
  }
}

async function cursorRequest<T>(endpoint: string, apiKey: string): Promise<T> {
  const response = await fetch(`https://api.cursor.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  })
  if (!response.ok) {
    const error = new Error(`Cursor API returned ${response.status}.`)
    Object.assign(error, { status: response.status })
    throw error
  }
  return (await response.json()) as T
}

function isSkippableCursorError(error: unknown) {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status?: number }).status)
      : Number(/\b(404|409|410)\b/.exec(errorMessage(error))?.[1])
  return status === 404 || status === 409 || status === 410
}

function startHookWatch() {
  if (hookMonitor) return
  void pollHookFile()
  hookMonitor = setInterval(() => void pollHookFile(), 2000)
}

async function pollHookFile() {
  const file =
    process.env.HEARBACK_RESPONSE_FILE ??
    path.join(homedir(), ".hearback", "responses.jsonl")
  let contents: string
  try {
    contents = await readFile(file, "utf8")
  } catch {
    return
  }

  for (const line of contents.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Partial<CapturedResponse> & {
        id?: string
      }
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.text !== "string" ||
        typeof parsed.createdAt !== "number"
      ) {
        continue
      }
      if (delivered.has(parsed.id)) continue
      delivered.add(parsed.id)
      emitResponse({
        id: parsed.id,
        text: parsed.text,
        createdAt: parsed.createdAt,
        source: "cursor",
      })
    } catch {
      // Ignore a partial final line while the hook is still writing.
    }
  }
  await saveDelivered()
}

async function captureClipboard() {
  const text = (await clipboard.readText()).trim()
  if (!text) return { captured: false }
  emitResponse({
    id: `clipboard:${Date.now()}`,
    text,
    createdAt: Date.now(),
    source: "manual",
  })
  showWindow()
  return { captured: true }
}

function emitResponse(response: CapturedResponse) {
  mainWindow?.webContents.send("hearback:response", response)
}

async function ensureServer() {
  if (await isHealthy()) return

  const companion = app.isPackaged
    ? path.join(process.resourcesPath, "companion")
    : path.join(__dirname, "..", "companion")
  const entry = path.join(companion, "server.js")
  server = spawn(process.execPath, [entry], {
    cwd: companion,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      NODE_ENV: "production",
    },
    stdio: "ignore",
    windowsHide: true,
  })

  for (let attempt = 0; attempt < 50; attempt += 1) {
    await delay(200)
    if (await isHealthy()) return
    if (server.exitCode !== null) break
  }

  throw new Error("Hearback could not start its local player on port 3000.")
}

async function isHealthy() {
  try {
    const response = await fetch(`${APP_URL}/api/health`, {
      signal: AbortSignal.timeout(800),
      cache: "no-store",
    })
    if (!response.ok) return false
    const body = (await response.json()) as { app?: string }
    return body.app === "hearback"
  } catch {
    return false
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApp() {
  quitting = true
  app.quit()
}

async function saveApiKey(apiKey: string) {
  await saveEncrypted(credentialsPath(), apiKey)
}

async function readApiKey() {
  return readEncrypted(credentialsPath())
}

async function saveEncrypted(file: string, value: string) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure credential storage is unavailable on this system.")
  }
  const encrypted = safeStorage.encryptString(value).toString("base64")
  await writeFile(file, encrypted, { mode: 0o600 })
}

async function readEncrypted(file: string) {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const encrypted = await readFile(file, "utf8")
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
  } catch {
    return null
  }
}

async function readAzureCredentials(): Promise<AzureCredentials | null> {
  const raw = await readEncrypted(azureCredentialsPath())
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AzureCredentials>
    if (typeof parsed.key !== "string" || typeof parsed.region !== "string") {
      return null
    }
    return { key: parsed.key, region: parsed.region }
  } catch {
    return null
  }
}

async function synthesizeAzure(
  rawText: string,
  requestedVoice: string,
  credentials: AzureCredentials
) {
  const text = rawText.replace(/\s+/g, " ").trim().slice(0, 400)
  if (!text) throw new Error("Nothing to speak.")
  const voice = ALLOWED_VOICES.has(requestedVoice)
    ? requestedVoice
    : "en-US-AriaNeural"
  const locale = voice.split("-").slice(0, 2).join("-")
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">${escapeXml(text)}</voice></speak>`
  const response = await fetch(
    `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": credentials.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "Hearback Desktop",
      },
      body: ssml,
    }
  )
  if (!response.ok) {
    throw new Error(`Azure Speech returned ${response.status}.`)
  }
  const audio = new Uint8Array(await response.arrayBuffer())
  if (audio.byteLength < 64) {
    throw new Error("Azure Speech returned empty audio.")
  }
  return audio
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
    }
    return entities[character] ?? character
  })
}

async function loadDelivered() {
  try {
    const raw = await readFile(deliveredPath(), "utf8")
    const ids = JSON.parse(raw) as string[]
    delivered = new Set(ids)
  } catch {
    delivered = new Set()
  }
}

async function saveDelivered() {
  const ids = [...delivered].slice(-500)
  await writeFile(deliveredPath(), JSON.stringify(ids), { mode: 0o600 })
}

function credentialsPath() {
  return path.join(app.getPath("userData"), "cursor-credential")
}

function deliveredPath() {
  return path.join(app.getPath("userData"), "delivered-runs.json")
}

function azureCredentialsPath() {
  return path.join(app.getPath("userData"), "azure-speech-credential")
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

