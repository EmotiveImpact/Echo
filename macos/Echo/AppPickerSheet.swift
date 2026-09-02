import AppKit
import SwiftUI

struct AppPickerSheet: View {
    @EnvironmentObject private var store: EchoStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var apps: [RunningAppInfo] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apps to listen to")
                        .font(.headline)
                    Text("Echo speaks a copy only if one of these apps is in front.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .keyboardShortcut(.defaultAction)
            }

            TextField("Filter running apps", text: $query)
                .textFieldStyle(.roundedBorder)

            if filtered.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "app.dashed")
                        .font(.title)
                        .foregroundStyle(.secondary)
                    Text("No matching apps")
                        .font(.headline)
                    Text("Open the app you want, then come back. Cursor is always listed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(filtered) { app in
                    Toggle(isOn: Binding(
                        get: { store.settings.allowedBundleIDs.contains(app.bundleID) },
                        set: { _ in store.toggleAllowedApp(app.bundleID) }
                    )) {
                        HStack(spacing: 8) {
                            if let icon = app.icon {
                                Image(nsImage: icon)
                                    .resizable()
                                    .frame(width: 20, height: 20)
                            }
                            VStack(alignment: .leading, spacing: 1) {
                                Text(app.name)
                                Text(app.bundleID)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .toggleStyle(.checkbox)
                }
                .listStyle(.inset)
            }
        }
        .padding(16)
        .frame(width: 420, height: 480)
        .preferredColorScheme(.dark)
        .onAppear {
            apps = store.runningApps()
        }
    }

    private var filtered: [RunningAppInfo] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { return apps }
        return apps.filter {
            $0.name.localizedCaseInsensitiveContains(q) || $0.bundleID.localizedCaseInsensitiveContains(q)
        }
    }
}
