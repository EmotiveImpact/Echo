import AppKit
import Foundation

enum CopyFilter {
    static let minimumLength = 48

    static func shouldCapture(_ text: String, previous: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let prior = previous.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == prior {
            return false
        }
        if trimmed.count < minimumLength {
            return false
        }
        if trimmed.rangeOfCharacter(from: .whitespacesAndNewlines) == nil {
            return false
        }
        if (trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")),
           !trimmed.contains(" ")
        {
            return false
        }
        if isTokenLike(trimmed) {
            return false
        }
        return true
    }

    static func allows(app: NSRunningApplication?, settings: AppSettings) -> Bool {
        if AppIdentity.isEcho(app) {
            return false
        }
        switch settings.copyMode {
        case .all:
            return true
        case .cursor:
            return CursorIdentity.matches(app)
        case .selected:
            guard let id = app?.bundleIdentifier else { return false }
            return settings.allowedBundleIDs.contains(id)
        }
    }

    private static func isTokenLike(_ text: String) -> Bool {
        guard text.count >= minimumLength else { return false }
        return text.unicodeScalars.allSatisfy { scalar in
            CharacterSet.alphanumerics.contains(scalar)
                || "+/_-=".unicodeScalars.contains(scalar)
        }
    }
}
