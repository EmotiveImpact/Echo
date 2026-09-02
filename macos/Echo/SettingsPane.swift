import SwiftUI

struct SettingsPane: View {
    @EnvironmentObject private var store: EchoStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Settings")
                    .font(.headline)
                Spacer()
                Button("Done") {
                    dismiss()
                }
                .keyboardShortcut(.cancelAction)
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            Form {
                Section("Voice") {
                    Picker("Voice", selection: $store.settings.voice) {
                        ForEach(VoiceOption.all) { voice in
                            Text(voice.name).tag(voice.id)
                        }
                    }
                    Slider(value: $store.settings.rate, in: 0.75...1.4, step: 0.05) {
                        Text("Rate")
                    } minimumValueLabel: {
                        Text("Slow")
                    } maximumValueLabel: {
                        Text("Fast")
                    }
                    Text(String(format: "%.2f×", store.settings.rate))
                        .foregroundStyle(.secondary)
                }

                Section("When to speak") {
                    Picker("Listen for copies from", selection: $store.settings.copyMode) {
                        ForEach(CopyMode.allCases) { mode in
                            Text(mode.title).tag(mode)
                        }
                    }
                    Text(store.settings.copyMode.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if store.settings.copyMode == .selected {
                        Button("Choose apps…") {
                            store.showingAppPicker = true
                        }
                    }
                    Toggle("Watch the clipboard", isOn: $store.settings.clipboardWatch)
                    Toggle("Autoplay new copies", isOn: $store.settings.autoplay)
                }

                Section("What to skip") {
                    Toggle("Skip fenced code blocks", isOn: $store.settings.skipCode)
                    Toggle("Say “link” instead of URLs", isOn: $store.settings.skipUrls)
                }

                Section("About") {
                    LabeledContent("Version", value: "0.3.5")
                    Text("Unsigned development build. First launch: xattr -cr ~/Downloads/Echo/Echo.app then open it. Edge Read Aloud has no published minute quota.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
        }
        .frame(width: 380, height: 480)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.showingAppPicker) {
            AppPickerSheet()
                .environmentObject(store)
        }
    }
}
