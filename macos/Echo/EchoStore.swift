import AppKit
import Combine
import Foundation

@MainActor
final class EchoStore: ObservableObject {
    @Published var settings: AppSettings {
        didSet { SettingsStore.save(settings) }
    }
    @Published var replies: [Reply] = []
    @Published var activeID: String?
    @Published var status: PlayStatus = .idle
    @Published var chunkIndex = 0
    @Published var chunkCount = 0
    @Published var currentLine = ""
    @Published var errorMessage: String?
    @Published var lastIgnoredReason: String?
    @Published var showingAppPicker = false

    private let watcher = ClipboardWatcher()
    private let player = SpeechPlayer()
    private var playTask: Task<Void, Never>?
    private var lastCaptured = ""
    private var audioCache: [String: Data] = [:]
    private var chunks: [String] = []

    init() {
        settings = SettingsStore.load()
        watcher.onCopy = { [weak self] text, app in
            self?.handleCopy(text, app: app, force: false)
        }
        watcher.start()
    }

    var listeningLabel: String {
        guard settings.clipboardWatch else { return "Paused" }
        if status == .playing { return "Speaking" }
        if status == .loading { return "Fetching voice" }
        switch settings.copyMode {
        case .cursor:
            return "Listening to Cursor"
        case .selected:
            if settings.allowedBundleIDs.isEmpty {
                return "Pick apps to listen"
            }
            return "Listening to \(settings.allowedBundleIDs.count) app\(settings.allowedBundleIDs.count == 1 ? "" : "s")"
        case .all:
            return "Listening to every copy"
        }
    }

    var statusSymbol: String {
        switch status {
        case .playing: return "waveform"
        case .loading: return "ellipsis.circle"
        case .paused: return "pause.circle"
        case .idle: return settings.clipboardWatch ? "ear" : "ear.slash"
        }
    }

    var activeReply: Reply? {
        replies.first(where: { $0.id == activeID })
    }

    func handleCopy(_ text: String, app: NSRunningApplication?, force: Bool) {
        errorMessage = nil
        lastIgnoredReason = nil

        if !force {
            guard settings.clipboardWatch else { return }
            if !CopyFilter.allows(app: app, settings: settings) {
                lastIgnoredReason = ignoredReason(for: app)
                return
            }
            if !CopyFilter.shouldCapture(text, previous: lastCaptured) {
                lastIgnoredReason = "Ignored a short snippet, URL, or token."
                return
            }
        } else if !CopyFilter.shouldCapture(text, previous: "") && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            errorMessage = "Clipboard is empty."
            return
        }

        lastCaptured = text
        let reply = Reply(
            id: UUID().uuidString,
            text: text,
            createdAt: Date(),
            appName: app?.localizedName ?? "Clipboard",
            bundleID: app?.bundleIdentifier ?? ""
        )
        replies.insert(reply, at: 0)
        if replies.count > 24 {
            replies = Array(replies.prefix(24))
        }

        if force || settings.autoplay {
            speak(reply)
        }
    }

    func readClipboardNow() {
        let app = NSWorkspace.shared.frontmostApplication
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        handleCopy(text, app: app, force: true)
    }

    func speak(_ reply: Reply) {
        playTask?.cancel()
        player.stop()
        activeID = reply.id
        errorMessage = nil
        lastIgnoredReason = nil
        let doc = Speakable.build(reply.text, skipCode: settings.skipCode, skipUrls: settings.skipUrls)
        chunks = doc.chunks
        chunkCount = chunks.count
        chunkIndex = 0
        currentLine = chunks.first ?? ""
        if chunks.isEmpty {
            status = .idle
            errorMessage = "Nothing speakable in that copy."
            return
        }

        playTask = Task { [weak self] in
            await self?.playFromCurrent()
        }
    }

    func togglePlay() {
        switch status {
        case .playing:
            player.pause()
            status = .paused
        case .paused:
            player.resumePlayback()
            status = .playing
        case .idle, .loading:
            if let active = activeReply {
                speak(active)
            } else if let first = replies.first {
                speak(first)
            } else {
                readClipboardNow()
            }
        }
    }

    func nextChunk() {
        guard chunkIndex + 1 < chunks.count else { return }
        chunkIndex += 1
        currentLine = chunks[chunkIndex]
        replayFromHere()
    }

    func previousChunk() {
        guard chunkIndex > 0 else { return }
        chunkIndex -= 1
        currentLine = chunks[chunkIndex]
        replayFromHere()
    }

    func stop() {
        playTask?.cancel()
        player.stop()
        status = .idle
    }

    func runningApps() -> [RunningAppInfo] {
        var seen = Set<String>()
        var apps: [RunningAppInfo] = []
        let running = NSWorkspace.shared.runningApplications
            .filter { $0.activationPolicy == .regular }
            .sorted { ($0.localizedName ?? "") < ($1.localizedName ?? "") }
        for app in running {
            guard let id = app.bundleIdentifier, seen.insert(id).inserted else { continue }
            apps.append(RunningAppInfo(id: id, name: app.localizedName ?? id, icon: app.icon))
        }
        for id in CursorIdentity.bundleIDs where seen.insert(id).inserted {
            apps.insert(RunningAppInfo(id: id, name: "Cursor", icon: nil), at: 0)
        }
        return apps
    }

    func toggleAllowedApp(_ id: String) {
        if let index = settings.allowedBundleIDs.firstIndex(of: id) {
            settings.allowedBundleIDs.remove(at: index)
        } else {
            settings.allowedBundleIDs.append(id)
        }
    }

    private func replayFromHere() {
        playTask?.cancel()
        player.stop()
        playTask = Task { [weak self] in
            await self?.playFromCurrent()
        }
    }

    private func playFromCurrent() async {
        let voice = VoiceOption.resolve(settings.voice)
        let rate = Float(settings.rate)
        while chunkIndex < chunks.count {
            if Task.isCancelled { return }
            currentLine = chunks[chunkIndex]
            status = .loading
            do {
                let audio = try await audioForCurrent(voice: voice)
                if Task.isCancelled { return }
                status = .playing
                try await player.play(data: audio, rate: rate)
            } catch is CancellationError {
                return
            } catch {
                status = .idle
                errorMessage = error.localizedDescription
                return
            }
            if Task.isCancelled { return }
            chunkIndex += 1
        }
        status = .idle
        currentLine = ""
    }

    private func audioForCurrent(voice: String) async throws -> Data {
        let key = "\(voice)|\(chunks[chunkIndex])"
        if let cached = audioCache[key] {
            return cached
        }
        let data = try await EdgeTTS.synthesize(text: chunks[chunkIndex], voice: voice)
        audioCache[key] = data
        if audioCache.count > 80 {
            audioCache.removeAll(keepingCapacity: true)
        }
        return data
    }

    private func ignoredReason(for app: NSRunningApplication?) -> String {
        let name = app?.localizedName ?? "another app"
        switch settings.copyMode {
        case .cursor:
            return "Ignored a copy from \(name). Listening to Cursor only."
        case .selected:
            if settings.allowedBundleIDs.isEmpty {
                return "Pick the apps Echo should listen to."
            }
            return "Ignored a copy from \(name)."
        case .all:
            return "Ignored that copy."
        }
    }
}
