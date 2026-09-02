use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct CloudAgent {
    pub id: String,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CloudRun {
    pub id: String,
    pub status: String,
    pub result: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    #[serde(rename = "userEmail")]
    user_email: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ListResponse<T> {
    items: Option<Vec<T>>,
}

#[derive(Debug, Deserialize)]
struct AgentItem {
    id: Option<String>,
    #[serde(rename = "agentId")]
    agent_id: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "lastModified")]
    last_modified: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RunItem {
    id: Option<String>,
    status: Option<String>,
    result: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: Option<String>,
}

pub async fn whoami(key: &str) -> Result<Option<String>, String> {
    let me: MeResponse = get("/v1/me", key).await?;
    Ok(me.user_email)
}

pub async fn list_agents(key: &str) -> Result<Vec<CloudAgent>, String> {
    let data: ListResponse<AgentItem> =
        get("/v1/agents?limit=20&includeArchived=true", key).await?;
    Ok(data
        .items
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let id = item.id.or(item.agent_id)?;
            Some(CloudAgent {
                id,
                updated_at: item.updated_at.or(item.last_modified),
            })
        })
        .collect())
}

pub async fn list_runs(agent_id: &str, key: &str) -> Result<Vec<CloudRun>, String> {
    let path = format!("/v1/agents/{}/runs?limit=5", urlencoding(agent_id));
    match get::<ListResponse<RunItem>>(&path, key).await {
        Ok(data) => Ok(data
            .items
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| {
                Some(CloudRun {
                    id: item.id?,
                    status: item.status.unwrap_or_default(),
                    result: item.result,
                    updated_at: item.updated_at.or(item.created_at),
                })
            })
            .collect()),
        Err(error) if is_skippable(&error) => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

pub fn is_finished(status: &str) -> bool {
    matches!(
        status,
        "FINISHED" | "finished" | "ERROR" | "error" | "CANCELLED" | "cancelled" | "EXPIRED"
    )
}

async fn get<T: for<'de> Deserialize<'de>>(path: &str, key: &str) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(format!("https://api.cursor.com{path}"))
        .header("Authorization", format!("Bearer {key}"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("Cursor API returned {}.", status.as_u16()));
    }
    response.json().await.map_err(|error| error.to_string())
}

fn is_skippable(error: &str) -> bool {
    error.contains(" 404") || error.contains(" 409") || error.contains(" 410")
        || error.contains("returned 404")
        || error.contains("returned 409")
        || error.contains("returned 410")
}

fn urlencoding(value: &str) -> String {
    let mut out = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}
