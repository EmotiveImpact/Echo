use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};

const WEBSITE: &str = "https://cursor.com";
const API: &str = "https://api2.cursor.sh";
const KEY_NAME: &str = "Echo Desktop";
const KEY_TTL_MS: u128 = 90 * 24 * 60 * 60 * 1000;

pub struct LoginSession {
    pub login_url: String,
    uuid: String,
    verifier: String,
}

pub struct LoginResult {
    pub api_key: String,
    pub email: Option<String>,
}

pub fn create_session() -> Result<LoginSession, String> {
    let mut verifier_bytes = [0u8; 96];
    getrandom::getrandom(&mut verifier_bytes).map_err(|error| error.to_string())?;
    let verifier = URL_SAFE_NO_PAD.encode(verifier_bytes);
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let uuid = uuid::Uuid::new_v4().to_string();
    let login_url = format!(
        "{WEBSITE}/loginDeepControl?challenge={challenge}&uuid={uuid}&mode=login&redirectTarget=sdk"
    );
    Ok(LoginSession {
        login_url,
        uuid,
        verifier,
    })
}

pub fn open_browser(url: &str) -> Result<(), String> {
    webbrowser::open(url).map_err(|error| error.to_string())
}

pub async fn finish_login(session: LoginSession) -> Result<LoginResult, String> {
    let tokens = poll_tokens(&session.uuid, &session.verifier).await?;
    mint_user_key(&tokens.access_token).await
}

#[derive(Debug, Deserialize)]
struct PollTokens {
    #[serde(alias = "accessToken")]
    access_token: String,
}

#[derive(Debug, Deserialize)]
struct MintResponse {
    #[serde(alias = "apiKey")]
    api_key: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    email: Option<String>,
    #[serde(alias = "userEmail")]
    user_email: Option<String>,
}

async fn poll_tokens(uuid: &str, verifier: &str) -> Result<PollTokens, String> {
    let client = http_client()?;
    let mut delay = std::time::Duration::from_secs(1);
    let mut use_get = false;
    let mut errors = 0u8;

    for _ in 0..180 {
        tokio::time::sleep(delay).await;
        let response = if use_get {
            client
                .get(format!("{API}/auth/poll"))
                .query(&[("uuid", uuid), ("verifier", verifier)])
                .send()
                .await
        } else {
            client
                .post(format!("{API}/auth/poll"))
                .json(&json!({ "uuid": uuid, "verifier": verifier }))
                .send()
                .await
        };
        let response = match response {
            Ok(response) => response,
            Err(_) => {
                errors += 1;
                if errors >= 8 {
                    return Err("Could not reach Cursor to finish sign-in.".into());
                }
                continue;
            }
        };

        let status = response.status();
        if status.as_u16() == 404 {
            errors = 0;
            delay = (delay.mul_f32(1.15)).min(std::time::Duration::from_secs(8));
            continue;
        }
        if !use_get && matches!(status.as_u16(), 404 | 405 | 501) {
            use_get = true;
            continue;
        }
        if status.is_success() {
            return response.json().await.map_err(|error| error.to_string());
        }
        errors += 1;
        if errors >= 5 {
            return Err(format!("Cursor sign-in failed ({status})."));
        }
    }
    Err("Cursor sign-in timed out. Click Connect Cursor and try again.".into())
}

async fn mint_user_key(access_token: &str) -> Result<LoginResult, String> {
    let client = http_client()?;
    let expires_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() + KEY_TTL_MS)
        .unwrap_or(0);
    let minted = client
        .post(format!(
            "{API}/aiserver.v1.DashboardService/CreateUserApiKey"
        ))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Connect-Protocol-Version", "1")
        .header("Content-Type", "application/json")
        .json(&json!({ "name": KEY_NAME, "expiresAtMs": expires_at_ms }))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !minted.status().is_success() {
        return Err(format!(
            "Cursor signed in, but creating an API key failed ({}).",
            minted.status()
        ));
    }
    let body: MintResponse = minted.json().await.map_err(|error| error.to_string())?;
    let api_key = body
        .api_key
        .filter(|key| !key.is_empty())
        .ok_or_else(|| "Cursor did not return an API key.".to_string())?;

    let email = client
        .post(format!("{API}/aiserver.v1.DashboardService/GetMe"))
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Connect-Protocol-Version", "1")
        .header("Content-Type", "application/json")
        .json(&json!({}))
        .send()
        .await
        .ok()
        .filter(|response| response.status().is_success());
    let email = if let Some(response) = email {
        response
            .json::<MeResponse>()
            .await
            .ok()
            .and_then(|me| me.email.or(me.user_email))
    } else {
        None
    };

    Ok(LoginResult { api_key, email })
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_has_sdk_login_url() {
        let session = create_session().expect("rng");
        assert!(session.login_url.contains("loginDeepControl"));
        assert!(session.login_url.contains("redirectTarget=sdk"));
        assert!(session.login_url.contains("challenge="));
        assert!(session.login_url.contains("uuid="));
    }
}
