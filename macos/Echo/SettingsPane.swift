import SwiftUI

struct SettingsPane: View {
    @EnvironmentObject private var store: EchoStore

    var body: some View {
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
                LabeledContent("Version", value: "0.3.0")
                Text("Unsigned development build. First launch: xattr -cr ~/Downloads/Echo.app then open it. Edge Read Aloud has no published minute quota.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding(8)
        .frame(minWidth: 360, minHeight: 420)
        .preferredColorScheme(.dark)
        .sheet(isPresented: $store.showingAppPicker) {
            AppPickerSheet()
                .environmentObject(store)
        }
    }
}
