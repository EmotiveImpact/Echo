import AppKit
import SwiftUI

struct AppPickerSheet: View {
    @EnvironmentObject private var store: EchoStore
    var onDone: () -> Void
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
                Button("Done", action: onDone)
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
                .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 4) {
                        ForEach(filtered) { app in
                            Button {
                                store.toggleAllowedApp(app.bundleID)
                            } label: {
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
                                    Spacer()
                                    if store.settings.allowedBundleIDs.contains(app.bundleID) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color.accentColor)
                                    }
                                }
                                .padding(8)
                                .background(
                                    Color.white.opacity(0.04),
                                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(minHeight: 220)
            }
        }
        .padding(16)
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
