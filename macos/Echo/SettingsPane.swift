import SwiftUI

struct SettingsPane: View {
    @EnvironmentObject private var store: EchoStore
    var onDone: () -> Void
    var onPickApps: () -> Void
    @State private var voiceOpen = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Settings")
                    .font(.headline)
                Spacer()
                Button("Done", action: onDone)
                    .keyboardShortcut(.cancelAction)
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    labeled("Voice") {
                        Button {
                            voiceOpen.toggle()
                        } label: {
                            HStack {
                                Text(currentVoiceName)
                                Spacer()
                                Image(systemName: voiceOpen ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(.secondary)
                            }
                            .padding(8)
                            .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                        .buttonStyle(.plain)

                        if voiceOpen {
                            VStack(spacing: 0) {
                                ForEach(VoiceOption.all) { voice in
                                    Button {
                                        store.settings.voice = voice.id
                                        voiceOpen = false
                                    } label: {
                                        HStack {
                                            Text(voice.name)
                                            Spacer()
                                            if store.settings.voice == voice.id {
                                                Image(systemName: "checkmark")
                                                    .foregroundStyle(Color.accentColor)
                                            }
                                        }
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 7)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }

                        HStack {
                            Text("Rate")
                            Spacer()
                            Text(String(format: "%.2f×", store.settings.rate))
                                .foregroundStyle(.secondary)
                        }
                        .font(.system(size: 12))
                        .padding(.top, 4)
                        Slider(value: $store.settings.rate, in: 0.75...1.4, step: 0.05)
                    }

                    labeled("When to speak") {
                        Picker("Listen for copies from", selection: $store.settings.copyMode) {
                            ForEach(CopyMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        Text(store.settings.copyMode.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if store.settings.copyMode == .selected {
                            Button("Choose apps", action: onPickApps)
                                .buttonStyle(.plain)
                                .foregroundStyle(Color.accentColor)
                        }
                        Toggle("Watch the clipboard", isOn: $store.settings.clipboardWatch)
                        Toggle("Autoplay new copies", isOn: $store.settings.autoplay)
                    }

                    labeled("What to skip") {
                        Toggle("Skip fenced code blocks", isOn: $store.settings.skipCode)
                        Toggle("Say “link” instead of URLs", isOn: $store.settings.skipUrls)
                    }

                    labeled("About") {
                        LabeledContent("Version", value: "0.3.7")
                    }
                }
                .padding(16)
            }
        }
    }

    private var currentVoiceName: String {
        VoiceOption.all.first(where: { $0.id == store.settings.voice })?.name ?? "Aria"
    }

    private func labeled(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            content()
        }
    }
}
