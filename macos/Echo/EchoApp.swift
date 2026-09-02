import SwiftUI

@main
struct EchoApp: App {
    @StateObject private var store = EchoStore()

    var body: some Scene {
        MenuBarExtra {
            MenuPanel()
                .environmentObject(store)
        } label: {
            Label("Echo", systemImage: store.statusSymbol)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsPane()
                .environmentObject(store)
        }
    }
}
