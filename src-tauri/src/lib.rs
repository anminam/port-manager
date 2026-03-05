use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::process::Command;

#[derive(Serialize, Clone)]
struct PortInfo {
    command: String,
    pid: u32,
    user: String,
    port: u16,
    safety: String,
    label: String,
    detail: String,
    #[serde(rename = "fullCommand")]
    full_command: String,
}

fn is_dev_port(port: u16) -> bool {
    matches!(
        port,
        3000..=3003
            | 3030
            | 3333
            | 4000
            | 4200
            | 4321
            | 5000..=5001
            | 5173..=5175
            | 5500
            | 6006
            | 8000..=8001
            | 8080..=8082
            | 8443
            | 8888
            | 9000
            | 9090
            | 9229
            | 24678
    )
}

fn is_dev_command(cmd: &str) -> bool {
    let dev_cmds = [
        "node", "next", "vite", "npm", "npx", "yarn", "pnpm", "bun", "python", "python3",
        "uvicorn", "gunicorn", "flask", "django", "ruby", "rails", "puma", "java", "gradle",
        "mvn", "php", "hugo", "gatsby", "deno", "tsx", "ts-node", "cargo", "go", "docker-pr",
    ];
    dev_cmds.contains(&cmd.to_lowercase().as_str())
}

fn is_system_command(cmd: &str) -> bool {
    let sys_cmds = [
        "launchd",
        "mDNSRespon",
        "systemd",
        "sshd",
        "cupsd",
        "rapportd",
        "sharingd",
        "ControlCe",
        "WiFiAgent",
        "UserEvent",
        "remoted",
        "bluetoothd",
        "airportd",
        "kernelmanag",
        "symptomsd",
        "apsd",
        "cloudd",
    ];
    sys_cmds.contains(&cmd)
}

fn classify_port(port: u16, command: &str) -> (String, String) {
    if is_system_command(command) {
        return ("system".into(), "시스템".into());
    }
    if is_dev_command(command) || is_dev_port(port) {
        return ("dev".into(), "개발".into());
    }
    if port < 1024 {
        return ("system".into(), "시스템".into());
    }
    ("unknown".into(), "기타".into())
}

fn get_full_commands(pids: &[u32]) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    if pids.is_empty() {
        return map;
    }
    let pid_args: Vec<String> = pids.iter().map(|p| p.to_string()).collect();
    let output = Command::new("ps")
        .arg("-p")
        .arg(pid_args.join(","))
        .arg("-o")
        .arg("pid=,command=")
        .output();

    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if let Some(space_idx) = trimmed.find(' ') {
                if let Ok(pid) = trimmed[..space_idx].trim().parse::<u32>() {
                    map.insert(pid, trimmed[space_idx..].trim().to_string());
                }
            }
        }
    }
    map
}

fn summarize_command(full_cmd: &str) -> String {
    if full_cmd.is_empty() {
        return String::new();
    }

    // node 계열
    if full_cmd.contains("node") {
        let parts: Vec<&str> = full_cmd.split_whitespace().collect();
        if let Some(bin_part) = parts.iter().find(|p| p.contains("node_modules/.bin/")) {
            let tool = bin_part.rsplit('/').next().unwrap_or("");
            let path_args: Vec<&str> = parts
                .iter()
                .filter(|p| p.starts_with('/') && !p.contains("node_modules/.bin"))
                .copied()
                .collect();
            let flags: Vec<&str> = parts.iter().filter(|p| p.starts_with('-')).copied().collect();
            let mut summary = tool.to_string();
            if let Some(path) = path_args.first() {
                let short: String = path.rsplit('/').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("/");
                summary = format!("{} → {}", summary, short);
            }
            if !flags.is_empty() {
                summary = format!("{} {}", summary, flags.join(" "));
            }
            return summary;
        }
    }

    // 일반
    let parts: Vec<&str> = full_cmd.split_whitespace().collect();
    let bin = parts[0].rsplit('/').next().unwrap_or(parts[0]);
    let args = parts[1..].join(" ");
    if args.len() > 60 {
        format!("{} {}...", bin, &args[..57])
    } else if args.is_empty() {
        bin.to_string()
    } else {
        format!("{} {}", bin, args)
    }
}

#[tauri::command]
fn get_ports() -> Vec<PortInfo> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("lsof -i -P -n | grep LISTEN")
        .output();

    let stdout = match output {
        Ok(o) => String::from_utf8_lossy(&o.stdout).to_string(),
        Err(_) => return vec![],
    };

    if stdout.is_empty() {
        return vec![];
    }

    let mut ports = Vec::new();
    let mut seen = HashSet::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 {
            continue;
        }

        let command = parts[0].to_string();
        let pid: u32 = match parts[1].parse() {
            Ok(p) => p,
            Err(_) => continue,
        };
        let user = parts[2].to_string();
        let name_field = parts[8];

        let port: u16 = match name_field.rsplit(':').next().and_then(|p| p.parse().ok()) {
            Some(p) => p,
            None => continue,
        };

        let key = format!("{}-{}", pid, port);
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);

        let (safety, label) = classify_port(port, &command);
        ports.push(PortInfo {
            command,
            pid,
            user,
            port,
            safety,
            label,
            detail: String::new(),
            full_command: String::new(),
        });
    }

    // 전체 명령어 가져오기
    let pids: Vec<u32> = ports.iter().map(|p| p.pid).collect::<HashSet<_>>().into_iter().collect();
    let cmd_map = get_full_commands(&pids);

    for p in &mut ports {
        if let Some(full) = cmd_map.get(&p.pid) {
            p.full_command = full.clone();
            p.detail = summarize_command(full);
        }
    }

    // 정렬: 개발 → 기타 → 시스템
    ports.sort_by(|a, b| {
        let order = |s: &str| match s {
            "dev" => 0,
            "unknown" => 1,
            "system" => 2,
            _ => 3,
        };
        order(&a.safety).cmp(&order(&b.safety)).then(a.port.cmp(&b.port))
    });

    ports
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<String, String> {
    let output = Command::new("kill")
        .arg("-9")
        .arg(pid.to_string())
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("PID {} 종료됨", pid))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_ports, kill_process])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
