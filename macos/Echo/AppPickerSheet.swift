import AppKit
import SwiftUI

struct AppPickerSheet: View {
    @EnvironmentObject private var store: EchoStore
    @State private var query = ""
    @State private var apps: [RunningAppInfo] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Button {
                    store.goHome()
                } label: {
                    Label("Back", systemImage: "chevron.left")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                Spacer()
                Text("Apps")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Done") {
                    store.goHome()
                }
                .font(.system(size: 13, weight: .semibold))
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider().opacity(0.35)

            VStack(alignment: .leading, spacing: 12) {
                Text("Echo speaks a copy only if one of these apps is in front.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

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
                                        store.settings.allowedBundleIDs.contains(app.bundleID)
                                            ? Color.accentColor.opacity(0.1)
                                            : Color.white.opacity(0.04),
                                        in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
            .padding(14)
        }
        .background(Color.black.opacity(0.2))
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
