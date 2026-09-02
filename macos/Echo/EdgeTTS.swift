import CryptoKit
import Foundation

enum TTSError: LocalizedError {
    case empty
    case timeout
    case closed
    case emptyAudio
    case badURL

    var errorDescription: String? {
        switch self {
        case .empty: return "Nothing to speak."
        case .timeout: return "Speech service timed out."
        case .closed: return "Speech connection closed."
        case .emptyAudio: return "The speech service returned empty audio."
        case .badURL: return "Could not reach the speech service."
        }
    }
}

enum EdgeTTS {
    static let trustedClientToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    static let chromiumVersion = "143.0.3650.75"
    private static let windowsFileTimeEpoch: UInt64 = 11_644_473_600

    static func synthesize(text: String, voice: String) async throws -> Data {
        let spoken = text
            .split { $0.isWhitespace || $0.isNewline }
            .joined(separator: " ")
        let clipped = String(spoken.prefix(400))
        if clipped.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw TTSError.empty
        }

        let resolved = VoiceOption.resolve(voice)
        let locale = locale(from: resolved)
        guard var components = URLComponents(string: "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1") else {
            throw TTSError.badURL
        }
        components.queryItems = [
            URLQueryItem(name: "TrustedClientToken", value: trustedClientToken),
            URLQueryItem(name: "Sec-MS-GEC", value: secMSGEC()),
            URLQueryItem(name: "Sec-MS-GEC-Version", value: "1-\(chromiumVersion)"),
        ]
        guard let url = components.url else { throw TTSError.badURL }

        var request = URLRequest(url: url)
        request.setValue("speech.platform.bing.com", forHTTPHeaderField: "Host")
        request.setValue("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold", forHTTPHeaderField: "Origin")
        request.setValue("no-cache", forHTTPHeaderField: "Pragma")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        let session = URLSession(configuration: .ephemeral)
        let task = session.webSocketTask(with: request)
        task.resume()
        defer {
            task.cancel(with: .goingAway, reason: nil)
            session.invalidateAndCancel()
        }

        let config =
            "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}"
        try await withTimeout(seconds: 12) {
            try await task.send(.string(config))
        }

        let requestID = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
        let ssml =
            "X-RequestId:\(requestID)\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"\(locale)\"><voice name=\"\(resolved)\">\(escapeXML(clipped))</voice></speak>"
        try await task.send(.string(ssml))

        var audio = Data()
        while true {
            let message = try await withTimeout(seconds: 20) {
                try await task.receive()
            }
            switch message {
            case let .data(data):
                let marker = Data("Path:audio\r\n".utf8)
                if let range = data.range(of: marker) {
                    audio.append(data[range.upperBound...])
                }
            case let .string(text):
                if text.contains("Path:turn.end") {
                    if audio.count < 64 { throw TTSError.emptyAudio }
                    return audio
                }
            @unknown default:
                break
            }
        }
    }

    static func secMSGEC() -> String {
        let unix = UInt64(Date().timeIntervalSince1970)
        let ticks = (unix + windowsFileTimeEpoch) * 10_000_000
        let rounded = ticks - (ticks % 3_000_000_000)
        let payload = "\(rounded)\(trustedClientToken)"
        let digest = SHA256.hash(data: Data(payload.utf8))
        return digest.map { String(format: "%02X", $0) }.joined()
    }

    private static var userAgent: String {
        let major = chromiumVersion.split(separator: ".").first.map(String.init) ?? "143"
        return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/\(major).0.0.0 Safari/537.36 Edg/\(major).0.0.0"
    }

    private static func locale(from voice: String) -> String {
        let parts = voice.split(separator: "-")
        if parts.count >= 2 {
            return "\(parts[0])-\(parts[1])"
        }
        return "en-US"
    }

    private static func escapeXML(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }
}

func withTimeout<T: Sendable>(seconds: TimeInterval, _ work: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask {
            try await work()
        }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TTSError.timeout
        }
        guard let result = try await group.next() else {
            throw TTSError.closed
        }
        group.cancelAll()
        return result
    }
}
