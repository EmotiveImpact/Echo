import Foundation

struct SpeakableDoc {
    let chunks: [String]
    let skippedCodeBlocks: Int
}

enum Speakable {
    static func build(_ raw: String, skipCode: Bool, skipUrls: Bool) -> SpeakableDoc {
        let text = raw.replacingOccurrences(of: "\r\n", with: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            return SpeakableDoc(chunks: [], skippedCodeBlocks: 0)
        }

        var chunks: [String] = []
        var skipped = 0

        for segment in splitFences(text) {
            switch segment {
            case let .code(_, body):
                skipped += 1
                if skipCode { continue }
                let spoken = speakCode(body)
                if !spoken.isEmpty {
                    chunks.append(contentsOf: wrap(spoken, max: 280))
                }
            case let .prose(body):
                for paragraph in body.components(separatedBy: "\n\n") {
                    let cleaned = markdownToSpeech(paragraph, skipUrls: skipUrls)
                    if cleaned.isEmpty { continue }
                    chunks.append(contentsOf: splitSentences(cleaned))
                }
            }
        }

        return SpeakableDoc(chunks: chunks, skippedCodeBlocks: skipped)
    }

    private enum Segment {
        case prose(String)
        case code(lang: String, body: String)
    }

    private static func splitFences(_ text: String) -> [Segment] {
        var parts: [Segment] = []
        var rest = text[...]
        while let start = rest.range(of: "```") {
            if start.lowerBound > rest.startIndex {
                parts.append(.prose(String(rest[rest.startIndex..<start.lowerBound])))
            }
            let after = rest[start.upperBound...]
            let langEnd = after.firstIndex(of: "\n") ?? after.endIndex
            let lang = after[after.startIndex..<langEnd].trimmingCharacters(in: .whitespacesAndNewlines)
            let bodyStart = langEnd == after.endIndex ? after.endIndex : after.index(after: langEnd)
            let bodyAndMore = after[bodyStart...]
            if let end = bodyAndMore.range(of: "```") {
                parts.append(.code(lang: lang, body: String(bodyAndMore[bodyAndMore.startIndex..<end.lowerBound])))
                rest = bodyAndMore[end.upperBound...]
            } else {
                parts.append(.code(lang: lang, body: String(bodyAndMore)))
                rest = bodyAndMore[bodyAndMore.endIndex...]
            }
        }
        if !rest.isEmpty {
            parts.append(.prose(String(rest)))
        }
        return parts
    }

    static func markdownToSpeech(_ input: String, skipUrls: Bool) -> String {
        var text = input
        text = replace(text, pattern: #"(?m)^\s*[-*+]\s+"#, with: "")
        text = replace(text, pattern: #"(?m)^\s*\d+\.\s+"#, with: "")
        text = replace(text, pattern: #"!\[[^\]]*]\([^)]*\)"#, with: "")
        text = replace(text, pattern: #"\[([^\]]+)]\([^)]*\)"#, with: "$1")
        text = replace(text, pattern: #"`([^`]+)`"#, with: "$1")
        text = replace(text, pattern: #"\*\*([^*]+)\*\*"#, with: "$1")
        text = replace(text, pattern: #"__([^_]+)__"#, with: "$1")
        text = replace(text, pattern: #"\*([^*]+)\*"#, with: "$1")
        text = replace(text, pattern: #"_([^_]+)_"#, with: "$1")
        text = replace(text, pattern: #"(?m)^#{1,6}\s+"#, with: "")
        text = replace(text, pattern: #"(?m)^>\s?"#, with: "")
        text = replace(text, pattern: #"(?m)^\|.*\|$"#, with: "")
        text = replace(text, pattern: #"(?m)^[-*]{3,}$"#, with: "")
        if skipUrls {
            text = replace(text, pattern: #"(?i)https?://\S+"#, with: "link")
        }
        text = replace(text, pattern: #"<!--[\s\S]*?-->"#, with: "")
        let words = text.split { $0.isWhitespace || $0.isNewline }.map(String.init)
        return words.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func splitSentences(_ text: String) -> [String] {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        var placeholders: [String] = []
        let masked = replace(trimmed, pattern: #"(?i)\b(e\.g|i\.e|etc|vs|Mr|Mrs|Dr|Ms|Prof|approx|fig)\."#) { match in
            let token = "§ABBREV\(placeholders.count)§"
            placeholders.append(match)
            return token
        }

        var pieces: [String] = []
        var start = masked.startIndex
        var index = masked.startIndex
        while index < masked.endIndex {
            let ch = masked[index]
            if ch == "." || ch == "!" || ch == "?" {
                let after = masked.index(after: index)
                if after < masked.endIndex {
                    let next = masked[after]
                    if next == " " || next == "\n" {
                        if let visible = masked[after...].first(where: { !$0.isWhitespace }) {
                            if visible.isUppercase || visible.isNumber || "“\"'(".contains(visible) {
                                let piece = masked[start...index].trimmingCharacters(in: .whitespacesAndNewlines)
                                if !piece.isEmpty {
                                    pieces.append(contentsOf: wrap(piece, max: 280))
                                }
                                start = masked[after...].firstIndex(where: { !$0.isWhitespace }) ?? masked.endIndex
                                index = start
                                continue
                            }
                        }
                    }
                }
            }
            index = masked.index(after: index)
        }
        if start < masked.endIndex {
            let piece = masked[start...].trimmingCharacters(in: .whitespacesAndNewlines)
            if !piece.isEmpty {
                pieces.append(contentsOf: wrap(piece, max: 280))
            }
        }

        return pieces.map { piece in
            var out = piece
            for (i, original) in placeholders.enumerated() {
                out = out.replacingOccurrences(of: "§ABBREV\(i)§", with: original)
            }
            return out
        }
    }

    private static func speakCode(_ body: String) -> String {
        let compact = body.trimmingCharacters(in: .whitespacesAndNewlines)
        if compact.isEmpty { return "" }
        let lines = compact.split(whereSeparator: \.isNewline).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if lines.count > 12 || compact.count > 400 {
            return "Short code sample, \(lines.count) lines."
        }
        return "Code. " + lines.joined(separator: ". ")
    }

    static func wrap(_ text: String, max: Int) -> [String] {
        if text.count <= max { return [text] }
        var lines: [String] = []
        var current = ""
        for word in text.split(separator: " ") {
            let next = current.isEmpty ? String(word) : current + " " + word
            if next.count > max && !current.isEmpty {
                lines.append(current)
                current = String(word)
            } else {
                current = next
            }
        }
        if !current.isEmpty { lines.append(current) }
        return lines
    }

    private static func replace(_ text: String, pattern: String, with template: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return text }
        let range = NSRange(text.startIndex..., in: text)
        return regex.stringByReplacingMatches(in: text, range: range, withTemplate: template)
    }

    private static func replace(_ text: String, pattern: String, transform: (String) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return text }
        let ns = text as NSString
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: ns.length))
        var result = text
        for match in matches.reversed() {
            guard let range = Range(match.range, in: result) else { continue }
            result.replaceSubrange(range, with: transform(String(result[range])))
        }
        return result
    }
}
