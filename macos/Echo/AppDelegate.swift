import AppKit
import Combine
import SwiftUI

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    static private(set) var shared: AppDelegate?

    let store = EchoStore()

    private var statusItem: NSStatusItem?
    private var panel: NSPanel?
    private var iconCancellable: AnyCancellable?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.shared = self
        NSApp.setActivationPolicy(.accessory)
        installStatusItem()
        buildPanel()
        showPanel()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showPanel()
        return true
    }

    @objc func togglePanel() {
        if let panel, panel.isVisible {
            panel.orderOut(nil)
        } else {
            showPanel()
        }
    }

    func showPanel() {
        if panel == nil {
            buildPanel()
        }
        positionPanel()
        panel?.makeKeyAndOrderFront(nil)
    }

    @objc private func statusClicked(_ sender: Any?) {
        guard let event = NSApp.currentEvent else {
            togglePanel()
            return
        }
        if event.type == .rightMouseUp {
            showStatusMenu()
        } else {
            togglePanel()
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        store.goHome()
        sender.orderOut(nil)
        return false
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = statusImage()
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "Echo"
        item.button?.target = self
        item.button?.action = #selector(statusClicked(_:))
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        statusItem = item

        iconCancellable = store.objectWillChange.sink { [weak self] _ in
            Task { @MainActor in
                self?.statusItem?.button?.image = self?.statusImage()
            }
        }
    }

    private func buildPanel() {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 600),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.title = "Echo"
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .moveToActiveSpace]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.backgroundColor = NSColor(calibratedWhite: 0.08, alpha: 0.96)
        panel.delegate = self

        let root = RootView()
            .environmentObject(store)
        let hosting = NSHostingView(rootView: root)
        hosting.sizingOptions = [.preferredSize]
        panel.contentView = hosting
        panel.setContentSize(NSSize(width: 360, height: 600))
        self.panel = panel
    }

    private func positionPanel() {
        guard let panel, let button = statusItem?.button, let buttonWindow = button.window else {
            panel?.center()
            return
        }
        let buttonRect = button.convert(button.bounds, to: nil)
        let screenRect = buttonWindow.convertToScreen(buttonRect)
        var origin = NSPoint(
            x: screenRect.midX - panel.frame.width / 2,
            y: screenRect.minY - panel.frame.height - 8
        )
        if let screen = buttonWindow.screen ?? NSScreen.main {
            let visible = screen.visibleFrame
            origin.x = min(max(origin.x, visible.minX + 8), visible.maxX - panel.frame.width - 8)
            if origin.y < visible.minY {
                origin.y = min(screenRect.maxY + 8, visible.maxY - panel.frame.height)
            }
        }
        panel.setFrameOrigin(origin)
    }

    private func showStatusMenu() {
        let menu = NSMenu()
        menu.addItem(withTitle: "Show Echo", action: #selector(togglePanel), keyEquivalent: "")
        menu.addItem(NSMenuItem.separator())
        menu.addItem(withTitle: "Quit Echo", action: #selector(quitApp), keyEquivalent: "q")
        statusItem?.menu = menu
        statusItem?.button?.performClick(nil)
        statusItem?.menu = nil
        statusItem?.button?.target = self
        statusItem?.button?.action = #selector(statusClicked(_:))
    }

    private func statusImage() -> NSImage? {
        let image = NSImage(systemSymbolName: store.statusSymbol, accessibilityDescription: "Echo")
        image?.isTemplate = true
        return image
    }
}
