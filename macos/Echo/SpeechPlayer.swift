import AVFoundation
import Foundation

@MainActor
final class SpeechPlayer: NSObject, AVAudioPlayerDelegate {
    private var player: AVAudioPlayer?
    private var finish: CheckedContinuation<Void, Error>?

    var isPlaying: Bool { player?.isPlaying ?? false }

    func play(data: Data, rate: Float) async throws {
        stopInternal(resume: true)
        let audio = try AVAudioPlayer(data: data)
        audio.enableRate = true
        audio.rate = min(max(rate, 0.5), 2.0)
        audio.delegate = self
        audio.prepareToPlay()
        player = audio
        guard audio.play() else {
            throw TTSError.emptyAudio
        }
        try await withCheckedThrowingContinuation { continuation in
            finish = continuation
        }
    }

    func pause() {
        player?.pause()
    }

    func resumePlayback() {
        player?.play()
    }

    func stop() {
        stopInternal(resume: true)
    }

    private func stopInternal(resume: Bool) {
        player?.delegate = nil
        player?.stop()
        player = nil
        if resume, let finish {
            self.finish = nil
            finish.resume(throwing: CancellationError())
        }
    }

    @objc nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            if let finish = self.finish {
                self.finish = nil
                if flag {
                    finish.resume()
                } else {
                    finish.resume(throwing: TTSError.emptyAudio)
                }
            }
        }
    }

    @objc nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            if let finish = self.finish {
                self.finish = nil
                finish.resume(throwing: error ?? TTSError.emptyAudio)
            }
        }
    }
}
