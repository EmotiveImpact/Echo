import SwiftUI

@main
struct EchoApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        // Accessory app: the real UI is the status-item panel in AppDelegate.
        // Keep a Settings scene so SwiftUI has a scene, but do not route the gear here.
        Settings {
            EmptyView()
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: EchoStore

    var body: some View {
        Group {
            switch store.page {
            case .home:
                MenuPanel()
            case .settings:
                SettingsPane()
            case .apps:
                AppPickerSheet()
            }
        }
        .frame(width: 360)
        .frame(minHeight: 520, maxHeight: 640)
        .preferredColorScheme(.dark)
    }
}
