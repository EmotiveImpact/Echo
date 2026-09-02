import AppKit
import Foundation

@MainActor
final class ClipboardWatcher {
    private var timer: Timer?
    private var lastChangeCount: Int = NSPasteboard.general.changeCount
    private let interval: TimeInterval = 0.35

    var onCopy: ((String, NSRunningApplication?) -> Void)?

    func start() {
        stop()
        lastChangeCount = NSPasteboard.general.changeCount
        let timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
        timer.tolerance = 0.1
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func tick() {
        let board = NSPasteboard.general
        let count = board.changeCount
        guard count != lastChangeCount else { return }
        lastChangeCount = count
        guard let text = board.string(forType: .string), !text.isEmpty else { return }
        onCopy?(text, NSWorkspace.shared.frontmostApplication)
    }
}
