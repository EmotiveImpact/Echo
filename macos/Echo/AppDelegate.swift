import AppKit
import Combine
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    static private(set) var shared: AppDelegate?

    private var store: EchoStore!
    private var statusItem: NSStatusItem?
    private var panel: NSPanel?
    private var iconCancellable: AnyCancellable?

    func applicationDidFinishLaunching(_ notification: Notification) {
        Self.shared = self
        NSApp.setActivationPolicy(.accessory)
        MainActor.assumeIsolated {
            self.store = EchoStore()
            self.installStatusItem()
            self.buildPanel()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showPanel()
        return true
    }

    @objc func showPanel() {
        if panel == nil {
            MainActor.assumeIsolated {
                self.buildPanel()
            }
        }
        positionPanel()
        NSApp.activate(ignoringOtherApps: true)
        panel?.deminiaturize(nil)
        panel?.makeKeyAndOrderFront(nil)
        panel?.orderFrontRegardless()
    }

    @objc func hidePanel() {
        panel?.orderOut(nil)
    }

    @objc func togglePanel() {
        if let panel, panel.isVisible, NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) {
            hidePanel()
        } else {
            showPanel()
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        Task { @MainActor in
            self.store.goHome()
        }
        sender.orderOut(nil)
        return false
    }

    @objc private func statusClicked(_ sender: Any?) {
        let event = NSApp.currentEvent
        if event?.type == .rightMouseUp || event?.type == .rightMouseDown || event?.modifierFlags.contains(.control) == true {
            popStatusMenu()
            return
        }
        togglePanel()
    }

    @objc private func quitApp() {
        NSApp.terminate(nil)
    }

    @MainActor
    private func installStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.menu = nil
        item.button?.image = Self.makeIcon(store.statusSymbol)
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "Echo — click to open"
        item.button?.target = self
        item.button?.action = #selector(statusClicked(_:))
        item.button?.sendAction(on: [.leftMouseUp, .rightMouseUp])
        statusItem = item

        iconCancellable = store.objectWillChange.sink { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                self.statusItem?.button?.image = Self.makeIcon(self.store.statusSymbol)
            }
        }
    }

    @MainActor
    private func buildPanel() {
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 600),
            styleMask: [.titled, .closable, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.title = "Echo"
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.worksWhenModal = true
        panel.becomesKeyOnlyIfNeeded = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .moveToActiveSpace]
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.backgroundColor = NSColor(calibratedWhite: 0.08, alpha: 0.96)
        panel.delegate = self

        let hosting = NSHostingView(rootView: RootView().environmentObject(store))
        hosting.frame = NSRect(x: 0, y: 0, width: 360, height: 600)
        panel.contentView = hosting
        panel.setContentSize(NSSize(width: 360, height: 600))
        self.panel = panel
    }

    private func positionPanel() {
        guard let panel else { return }
        panel.setContentSize(NSSize(width: 360, height: 600))
        guard let button = statusItem?.button, let buttonWindow = button.window else {
            panel.center()
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

    private func popStatusMenu() {
        let menu = NSMenu()
        let show = NSMenuItem(title: "Show Echo", action: #selector(showPanel), keyEquivalent: "")
        show.target = self
        menu.addItem(show)
        menu.addItem(NSMenuItem.separator())
        let quit = NSMenuItem(title: "Quit Echo", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        guard let button = statusItem?.button else { return }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: button.bounds.height + 4), in: button)
    }

    private static func makeIcon(_ symbol: String) -> NSImage? {
        let image = NSImage(systemSymbolName: symbol, accessibilityDescription: "Echo")
        image?.isTemplate = true
        return image
    }
}
