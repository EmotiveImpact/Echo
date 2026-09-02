import AppKit
import Foundation

@MainActor
final class ClipboardWatcher {
    private var timer: DispatchSourceTimer?
    private var lastChangeCount: Int = NSPasteboard.general.changeCount
    private var lastRegularApp: NSRunningApplication?
    private var activationObserver: NSObjectProtocol?

    var onCopy: ((String, NSRunningApplication?) -> Void)?

    func start() {
        stop()
        lastChangeCount = NSPasteboard.general.changeCount
        remember(NSWorkspace.shared.frontmostApplication)

        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            Task { @MainActor in
                self?.remember(app)
            }
        }

        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + 0.25, repeating: 0.25, leeway: .milliseconds(80))
        timer.setEventHandler { [weak self] in
            Task { @MainActor in
                self?.tick()
            }
        }
        timer.resume()
        self.timer = timer
    }

    func stop() {
        timer?.cancel()
        timer = nil
        if let activationObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(activationObserver)
            self.activationObserver = nil
        }
    }

    private func tick() {
        remember(NSWorkspace.shared.frontmostApplication)
        let board = NSPasteboard.general
        let count = board.changeCount
        guard count != lastChangeCount else { return }
        lastChangeCount = count
        guard let text = board.string(forType: .string), !text.isEmpty else { return }
        onCopy?(text, sourceApp())
    }

    private func sourceApp() -> NSRunningApplication? {
        let front = NSWorkspace.shared.frontmostApplication
        if !AppIdentity.isEcho(front) {
            return front
        }
        return lastRegularApp
    }

    private func remember(_ app: NSRunningApplication?) {
        guard let app, !AppIdentity.isEcho(app) else { return }
        if app.activationPolicy == .regular || app.bundleIdentifier != nil {
            lastRegularApp = app
        }
    }
}

enum AppIdentity {
    static func isEcho(_ app: NSRunningApplication?) -> Bool {
        guard let id = app?.bundleIdentifier?.lowercased() else { return false }
        return id == "com.emotiveimpact.echo" || id.contains("emotiveimpact.echo")
    }
}
