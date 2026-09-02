import SwiftUI

struct SettingsPane: View {
    @EnvironmentObject private var store: EchoStore
    var onDone: () -> Void
    var onPickApps: () -> Void

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
                        ForEach(VoiceOption.all) { voice in
                            Button {
                                store.settings.voice = voice.id
                            } label: {
                                HStack {
                                    Text(voice.name)
                                    Spacer()
                                    if store.settings.voice == voice.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color.accentColor)
                                    }
                                }
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                        }

                        HStack {
                            Text("Rate")
                            Spacer()
                            Text(String(format: "%.2f×", store.settings.rate))
                                .foregroundStyle(.secondary)
                        }
                        .font(.system(size: 12))
                        .padding(.top, 8)
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
                        LabeledContent("Version", value: "0.3.6")
                        Text("Tap a voice name. Dropdown menus close this panel, so they are not used here.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(16)
            }
        }
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
