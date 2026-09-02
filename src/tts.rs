use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use sha2::{Digest, Sha256};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

use crate::model::resolve_voice;

const TRUSTED_CLIENT_TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION: &str = "143.0.3650.75";
const WINDOWS_FILE_TIME_EPOCH: u64 = 11_644_473_600;

pub async fn synthesize(text: &str, voice: &str) -> Result<Vec<u8>, String> {
    let spoken = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let spoken = spoken.chars().take(400).collect::<String>();
    if spoken.trim().is_empty() {
        return Err("Nothing to speak.".into());
    }
    let voice = resolve_voice(voice);
    let locale = locale_from_voice(voice);
    let token = sec_ms_gec_token();
    let url = format!(
        "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken={TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC={token}&Sec-MS-GEC-Version=1-{CHROMIUM_FULL_VERSION}"
    );
    let mut request = url
        .into_client_request()
        .map_err(|error| error.to_string())?;
    let headers = request.headers_mut();
    headers.insert("Host", "speech.platform.bing.com".parse().unwrap());
    headers.insert(
        "Origin",
        "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
            .parse()
            .unwrap(),
    );
    headers.insert("Pragma", "no-cache".parse().unwrap());
    headers.insert("Cache-Control", "no-cache".parse().unwrap());
    let ua = format!(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{}.0.0.0 Safari/537.36 Edg/{}.0.0.0",
        CHROMIUM_FULL_VERSION.split('.').next().unwrap_or("143"),
        CHROMIUM_FULL_VERSION.split('.').next().unwrap_or("143")
    );
    headers.insert("User-Agent", ua.parse().unwrap());

    let (mut socket, _) = tokio::time::timeout(
        std::time::Duration::from_secs(12),
        tokio_tungstenite::connect_async(request),
    )
    .await
    .map_err(|_| "Speech service timed out.".to_string())?
    .map_err(|error| error.to_string())?;

    let config = format!(
        "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{{\"context\":{{\"synthesis\":{{\"audio\":{{\"metadataoptions\":{{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"}},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}}}}}"
    );
    socket
        .send(Message::Text(config.into()))
        .await
        .map_err(|error| error.to_string())?;

    let request_id = uuid::Uuid::new_v4().simple().to_string();
    let ssml = format!(
        "X-RequestId:{request_id}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" xml:lang=\"{locale}\"><voice name=\"{voice}\">{text}</voice></speak>",
        text = escape_xml(&spoken)
    );
    socket
        .send(Message::Text(ssml.into()))
        .await
        .map_err(|error| error.to_string())?;

    let mut audio = Vec::new();
    loop {
        let message = tokio::time::timeout(std::time::Duration::from_secs(20), socket.next())
            .await
            .map_err(|_| "Speech service timed out.".to_string())?
            .ok_or_else(|| "Speech connection closed.".to_string())?
            .map_err(|error| error.to_string())?;
        match message {
            Message::Binary(data) => {
                let marker = b"Path:audio\r\n";
                if let Some(index) = find_subslice(&data, marker) {
                    audio.extend_from_slice(&data[index + marker.len()..]);
                }
            }
            Message::Text(text) => {
                if text.contains("Path:turn.end") {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    if audio.len() < 64 {
        return Err("The speech service returned empty audio.".into());
    }
    Ok(audio)
}

fn sec_ms_gec_token() -> String {
    let unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let ticks = (u128::from(unix) + u128::from(WINDOWS_FILE_TIME_EPOCH)) * 10_000_000;
    let rounded = ticks - (ticks % 3_000_000_000);
    let payload = format!("{rounded}{TRUSTED_CLIENT_TOKEN}");
    let digest = Sha256::digest(payload.as_bytes());
    hex::encode_upper(digest)
}

fn locale_from_voice(voice: &str) -> String {
    let parts: Vec<&str> = voice.split('-').collect();
    if parts.len() >= 2 {
        format!("{}-{}", parts[0], parts[1])
    } else {
        "en-US".into()
    }
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
