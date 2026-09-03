import AppKit
import Foundation

enum CopyMode: String, Codable, CaseIterable, Identifiable {
    case cursor
    case selected
    case all

    var id: String { rawValue }

    var title: String {
        switch self {
        case .cursor: return "Cursor"
        case .selected: return "Apps"
        case .all: return "All"
        }
    }

    var detail: String {
        switch self {
        case .cursor:
            return "Only copies made while Cursor is in front."
        case .selected:
            return "Only copies from the apps you pick."
        case .all:
            return "Any qualifying copy on the pasteboard."
        }
    }
}

enum PlayStatus: String {
    case idle
    case loading
    case playing
    case paused
}

struct VoiceOption: Identifiable, Hashable {
    let id: String
    let name: String

    static let all: [VoiceOption] = [
        .init(id: "en-US-AriaNeural", name: "Aria"),
        .init(id: "en-US-JennyNeural", name: "Jenny"),
        .init(id: "en-US-AndrewNeural", name: "Andrew"),
        .init(id: "en-US-EmmaNeural", name: "Emma"),
        .init(id: "en-US-GuyNeural", name: "Guy"),
        .init(id: "en-GB-SoniaNeural", name: "Sonia"),
        .init(id: "en-GB-RyanNeural", name: "Ryan"),
    ]

    static func resolve(_ raw: String) -> String {
        if all.contains(where: { $0.id == raw }) {
            return raw
        }
        return all[0].id
    }
}

struct Reply: Identifiable, Hashable {
    let id: String
    let text: String
    let createdAt: Date
    let appName: String
    let bundleID: String
}

struct RunningAppInfo: Identifiable, Hashable {
    let id: String
    let name: String
    let icon: NSImage?

    var bundleID: String { id }
}

enum CursorIdentity {
    static let bundleIDs: Set<String> = [
        "com.todesktop.230313mzl4w4u92",
        "com.anysphere.cursor",
        "dev.todesktop.cursor",
    ]

    static func matches(_ app: NSRunningApplication?) -> Bool {
        guard let app else { return false }
        if let id = app.bundleIdentifier {
            if bundleIDs.contains(id) { return true }
            if id.lowercased().contains("cursor") { return true }
        }
        if let name = app.localizedName {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.caseInsensitiveCompare("Cursor") == .orderedSame { return true }
            if trimmed.lowercased().hasPrefix("cursor") { return true }
        }
        if let executable = app.executableURL?.path.lowercased(),
           executable.contains("/cursor")
        {
            return true
        }
        return false
    }
}

struct AppSettings: Codable, Equatable {
    var voice: String
    var rate: Double
    var skipCode: Bool
    var skipUrls: Bool
    var clipboardWatch: Bool
    var autoplay: Bool
    var copyMode: CopyMode
    var allowedBundleIDs: [String]

    enum CodingKeys: String, CodingKey {
        case voice
        case rate
        case skipCode = "skip_code"
        case skipUrls = "skip_urls"
        case clipboardWatch = "clipboard_watch"
        case autoplay
        case copyMode = "copy_mode"
        case allowedBundleIDs = "allowed_bundle_ids"
    }

    init(
        voice: String = "en-US-AriaNeural",
        rate: Double = 1.05,
        skipCode: Bool = true,
        skipUrls: Bool = true,
        clipboardWatch: Bool = true,
        autoplay: Bool = true,
        copyMode: CopyMode = .cursor,
        allowedBundleIDs: [String] = []
    ) {
        self.voice = voice
        self.rate = rate
        self.skipCode = skipCode
        self.skipUrls = skipUrls
        self.clipboardWatch = clipboardWatch
        self.autoplay = autoplay
        self.copyMode = copyMode
        self.allowedBundleIDs = allowedBundleIDs
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        voice = try container.decodeIfPresent(String.self, forKey: .voice) ?? "en-US-AriaNeural"
        rate = try container.decodeIfPresent(Double.self, forKey: .rate) ?? 1.05
        skipCode = try container.decodeIfPresent(Bool.self, forKey: .skipCode) ?? true
        skipUrls = try container.decodeIfPresent(Bool.self, forKey: .skipUrls) ?? true
        clipboardWatch = try container.decodeIfPresent(Bool.self, forKey: .clipboardWatch) ?? true
        autoplay = try container.decodeIfPresent(Bool.self, forKey: .autoplay) ?? true
        copyMode = try container.decodeIfPresent(CopyMode.self, forKey: .copyMode) ?? .cursor
        allowedBundleIDs = try container.decodeIfPresent([String].self, forKey: .allowedBundleIDs) ?? []
    }
}

enum EchoPaths {
    static var home: URL {
        if let override = ProcessInfo.processInfo.environment["ECHO_HOME"], !override.isEmpty {
            return URL(fileURLWithPath: override, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".echo", isDirectory: true)
    }

    static var settings: URL {
        home.appendingPathComponent("settings.json")
    }

    static func ensureHome() {
        try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
    }
}

enum SettingsStore {
    static func load() -> AppSettings {
        guard let data = try? Data(contentsOf: EchoPaths.settings),
              let settings = try? JSONDecoder().decode(AppSettings.self, from: data)
        else {
            return AppSettings()
        }
        return settings
    }

    static func save(_ settings: AppSettings) {
        EchoPaths.ensureHome()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(settings) else { return }
        try? data.write(to: EchoPaths.settings, options: .atomic)
    }
}
