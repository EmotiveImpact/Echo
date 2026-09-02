import SwiftUI

struct SettingsPane: View {
    @EnvironmentObject private var store: EchoStore

    var body: some View {
        VStack(spacing: 0) {
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
                Text("Settings")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Button("Done") {
                    store.goHome()
                }
                .font(.system(size: 13, weight: .semibold))
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)

            Divider().opacity(0.35)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section("Voice") {
                        Text("No sign-in. Echo talks to Microsoft Edge Read Aloud with a public client token. There is no Cursor API key and no Azure account.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

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

                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Rate")
                                Spacer()
                                Text(String(format: "%.2f×", store.settings.rate))
                                    .foregroundStyle(.secondary)
                            }
                            .font(.system(size: 12))
                            Slider(value: $store.settings.rate, in: 0.75...1.4, step: 0.05)
                        }
                    }

                    section("When to speak") {
                        Picker("Listen for copies from", selection: $store.settings.copyMode) {
                            ForEach(CopyMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        Text(store.settings.copyMode.detail)
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                        if store.settings.copyMode == .selected {
                            Button("Choose apps") {
                                store.openApps()
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.accentColor)
                        }
                        Toggle("Watch the clipboard", isOn: $store.settings.clipboardWatch)
                        Toggle("Autoplay new copies", isOn: $store.settings.autoplay)
                    }

                    section("What to skip") {
                        Toggle("Skip fenced code blocks", isOn: $store.settings.skipCode)
                        Toggle("Say “link” instead of URLs", isOn: $store.settings.skipUrls)
                    }

                    section("About") {
                        LabeledContent("Version", value: "0.3.2")
                        Text("Unsigned development build. First launch: xattr -cr ~/Downloads/Echo/Echo.app then open it. Edge Read Aloud has no published minute quota.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                        Button("Quit Echo") {
                            NSApp.terminate(nil)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.red)
                    }
                }
                .padding(14)
            }
        }
        .background(Color.black.opacity(0.2))
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            content()
        }
    }
}
