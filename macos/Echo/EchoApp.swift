import SwiftUI

@main
struct EchoApp: App {
    @StateObject private var store = EchoStore()

    var body: some Scene {
        MenuBarExtra {
            MenuPanel()
                .environmentObject(store)
        } label: {
            Image(systemName: store.statusSymbol)
        }
        .menuBarExtraStyle(.window)
    }
}
