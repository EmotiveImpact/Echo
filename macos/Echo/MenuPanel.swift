import SwiftUI

struct MenuPanel: View {
    @EnvironmentObject private var store: EchoStore
    @State private var showingSettings = false

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().opacity(0.35)
            sourcePicker
                .padding(.horizontal, 14)
                .padding(.top, 12)
            nowPlaying
                .padding(.horizontal, 14)
                .padding(.top, 12)
            transport
                .padding(.top, 10)
            if let error = store.errorMessage {
                banner(error, tint: Color.red.opacity(0.85))
            } else if let ignored = store.lastIgnoredReason, store.status == .idle {
                banner(ignored, tint: Color.white.opacity(0.55))
            }
            queue
            footer
        }
        .frame(width: 348)
        .background(PanelBackground())
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.showingAppPicker) {
            AppPickerSheet()
                .environmentObject(store)
        }
        .sheet(isPresented: $showingSettings) {
            SettingsPane()
                .environmentObject(store)
                .frame(width: 380, height: 460)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.18))
                    .frame(width: 28, height: 28)
                Image(systemName: store.statusSymbol)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text("Echo")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                Text(store.listeningLabel)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
                .shadow(color: statusColor.opacity(0.8), radius: 4)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }

    private var sourcePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Copy source", selection: $store.settings.copyMode) {
                ForEach(CopyMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            Text(store.settings.copyMode.detail)
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if store.settings.copyMode == .selected {
                Button {
                    store.showingAppPicker = true
                } label: {
                    HStack {
                        Image(systemName: "app.badge.checkmark")
                        Text(store.settings.allowedBundleIDs.isEmpty ? "Choose apps" : "Edit apps")
                        Spacer()
                        if !store.settings.allowedBundleIDs.isEmpty {
                            Text("\(store.settings.allowedBundleIDs.count)")
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.accentColor.opacity(0.2), in: Capsule())
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(8)
                .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    private var nowPlaying: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(nowPlayingTitle)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            Text(store.currentLine.isEmpty ? emptyCopy : store.currentLine)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(store.currentLine.isEmpty ? .secondary : .primary)
                .lineLimit(4)
                .frame(maxWidth: .infinity, alignment: .leading)
            if store.chunkCount > 0 {
                HStack {
                    Text("\(min(store.chunkIndex + 1, store.chunkCount)) / \(store.chunkCount)")
                    if let reply = store.activeReply {
                        Text("·")
                        Text(reply.appName)
                    }
                    Spacer()
                    if store.status == .loading {
                        ProgressView()
                            .controlSize(.mini)
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var transport: some View {
        HStack(spacing: 18) {
            IconButton(systemName: "backward.fill") {
                store.previousChunk()
            }
            .disabled(store.chunkIndex == 0)

            Button(action: store.togglePlay) {
                Image(systemName: store.status == .playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 44, height: 44)
                    .foregroundStyle(.black)
                    .background(Color.accentColor, in: Circle())
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.space, modifiers: [])

            IconButton(systemName: "forward.fill") {
                store.nextChunk()
            }
            .disabled(store.chunkIndex + 1 >= store.chunkCount)
        }
        .padding(.bottom, 10)
    }

    private var queue: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Recent copies")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Spacer()
            }
            .padding(.horizontal, 14)

            if store.replies.isEmpty {
                Text("Copy a Cursor reply. Echo speaks it.")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 12)
            } else {
                ScrollView {
                    LazyVStack(spacing: 4) {
                        ForEach(store.replies) { reply in
                            Button {
                                store.speak(reply)
                            } label: {
                                HStack(alignment: .top, spacing: 8) {
                                    Circle()
                                        .fill(reply.id == store.activeID ? Color.accentColor : Color.white.opacity(0.2))
                                        .frame(width: 6, height: 6)
                                        .padding(.top, 5)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(preview(reply.text))
                                            .font(.system(size: 12))
                                            .lineLimit(2)
                                            .foregroundStyle(.primary)
                                        Text(reply.appName)
                                            .font(.system(size: 10))
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(8)
                                .background(
                                    reply.id == store.activeID ? Color.accentColor.opacity(0.1) : Color.clear,
                                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 10)
                }
                .frame(maxHeight: 168)
                .padding(.bottom, 8)
            }
        }
        .padding(.top, 4)
    }

    private var footer: some View {
        HStack {
            Toggle("Autoplay", isOn: $store.settings.autoplay)
                .toggleStyle(.switch)
                .controlSize(.mini)
                .font(.system(size: 11))
            Spacer()
            Button("Read clipboard") {
                store.readClipboardNow()
            }
            .font(.system(size: 11, weight: .medium))
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
            Button {
                showingSettings = true
            } label: {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.plain)
            .help("Settings")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.25))
    }

    private var statusColor: Color {
        switch store.status {
        case .playing: return Color.accentColor
        case .loading: return Color.orange
        case .paused: return Color.yellow
        case .idle: return store.settings.clipboardWatch ? Color.green : Color.secondary
        }
    }

    private var nowPlayingTitle: String {
        switch store.status {
        case .playing: return "Speaking"
        case .loading: return "Fetching voice"
        case .paused: return "Paused"
        case .idle: return "Ready"
        }
    }

    private var emptyCopy: String {
        switch store.settings.copyMode {
        case .cursor:
            return "Copy a reply in Cursor. Echo starts speaking."
        case .selected:
            return store.settings.allowedBundleIDs.isEmpty
                ? "Choose the apps whose copies Echo should speak."
                : "Copy something in one of the selected apps."
        case .all:
            return "Copy a paragraph. Echo speaks qualifying text."
        }
    }

    private func preview(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 90 { return trimmed }
        return String(trimmed.prefix(90)) + "…"
    }

    private func banner(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 11))
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14)
            .padding(.top, 4)
    }
}

private struct IconButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .semibold))
                .frame(width: 28, height: 28)
                .background(Color.white.opacity(0.08), in: Circle())
        }
        .buttonStyle(.plain)
    }
}

private struct PanelBackground: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.black.opacity(0.35),
                            Color(red: 0.12, green: 0.09, blue: 0.04).opacity(0.55),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
    }
}
