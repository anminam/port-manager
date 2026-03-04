const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require("electron");
const { exec } = require("child_process");
const path = require("path");

let mainWindow;

function createWindow() {
  const pngPath = path.join(__dirname, "icon.iconset", "icon_512x512.png");
  const appIcon = nativeImage.createFromPath(pngPath);

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1a1a2e",
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // macOS Dock 아이콘 설정
  if (process.platform === "darwin") {
    app.dock.setIcon(appIcon);
  }

  mainWindow.loadFile("index.html");
}

// 개발용 포트 범위 및 프로세스 판별
const DEV_PORTS = new Set([
  3000, 3001, 3002, 3003, 3030, 3333,
  4000, 4200, 4321,
  5000, 5001, 5173, 5174, 5175, 5500,
  6006,
  8000, 8001, 8080, 8081, 8082, 8443, 8888,
  9000, 9090, 9229,
  24678,
]);

const DEV_COMMANDS = new Set([
  "node", "next", "vite", "npm", "npx", "yarn", "pnpm", "bun",
  "python", "python3", "uvicorn", "gunicorn", "flask", "django",
  "ruby", "rails", "puma",
  "java", "gradle", "mvn",
  "php", "hugo", "gatsby",
  "deno", "tsx", "ts-node",
  "cargo", "go",
  "docker-pr",
]);

const SYSTEM_COMMANDS = new Set([
  "launchd", "mDNSRespon", "systemd", "sshd", "cupsd",
  "rapportd", "sharingd", "ControlCe", "WiFiAgent",
  "UserEvent", "remoted", "bluetoothd", "airportd",
  "kernelmanag", "symptomsd", "apsd", "cloudd",
]);

function classifyPort(port, command) {
  const cmdLower = command.toLowerCase();

  // 시스템 프로세스는 무조건 system
  if (SYSTEM_COMMANDS.has(command)) {
    return { safety: "system", label: "시스템" };
  }

  // 개발 프로세스 + 개발 포트 → 확실한 개발용
  const isDevCmd = DEV_COMMANDS.has(cmdLower) || DEV_COMMANDS.has(command);
  const isDevPort = DEV_PORTS.has(port);

  if (isDevCmd && isDevPort) {
    return { safety: "dev", label: "개발" };
  }

  if (isDevCmd) {
    return { safety: "dev", label: "개발" };
  }

  if (isDevPort) {
    return { safety: "dev", label: "개발" };
  }

  // well-known 포트 (0-1023)
  if (port < 1024) {
    return { safety: "system", label: "시스템" };
  }

  return { safety: "unknown", label: "기타" };
}

// lsof 결과를 파싱하여 포트 정보 배열로 변환
function parseLsofOutput(stdout) {
  const lines = stdout.trim().split("\n");
  const ports = [];
  const seen = new Set();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const pid = parts[1];
    const user = parts[2];
    const nameField = parts[8];

    // "host:port" 형태에서 포트 추출
    const match = nameField.match(/:(\d+)$/);
    if (!match) continue;

    const port = match[1];
    const key = `${pid}-${port}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const { safety, label } = classifyPort(Number(port), command);
    ports.push({ command, pid: Number(pid), user, port: Number(port), safety, label });
  }

  // 개발용 먼저, 그 다음 기타, 마지막에 시스템 → 같은 그룹 내에서는 포트 순
  const order = { dev: 0, unknown: 1, system: 2 };
  ports.sort((a, b) => order[a.safety] - order[b.safety] || a.port - b.port);
  return ports;
}

// PID 목록의 전체 명령어를 가져오기
function getFullCommands(pids) {
  return new Promise((resolve) => {
    if (pids.length === 0) {
      resolve({});
      return;
    }
    exec(`ps -p ${pids.join(",")} -o pid=,command=`, (error, stdout) => {
      const map = {};
      if (error || !stdout) {
        resolve(map);
        return;
      }
      for (const line of stdout.trim().split("\n")) {
        const trimmed = line.trim();
        const spaceIdx = trimmed.indexOf(" ");
        if (spaceIdx === -1) continue;
        const pid = trimmed.substring(0, spaceIdx).trim();
        const cmd = trimmed.substring(spaceIdx + 1).trim();
        map[pid] = cmd;
      }
      resolve(map);
    });
  });
}

// 전체 명령어에서 사람이 읽기 좋은 요약을 생성
function summarizeCommand(fullCmd) {
  if (!fullCmd) return "";

  // node 계열: 실행 중인 스크립트/도구 이름 추출
  const nodeMatch = fullCmd.match(/node\s+.*\/([^/\s]+)$/);
  if (nodeMatch) {
    // serve, next, vite 등 도구명 + 인자
    const tool = nodeMatch[1];
    // 인자에서 경로 추출
    const parts = fullCmd.split(/\s+/);
    const pathArgs = parts.filter((p) => p.startsWith("/") && !p.includes("node_modules/.bin"));
    const flags = parts.filter((p) => p.startsWith("-"));
    let summary = tool;
    if (pathArgs.length > 0) {
      // 경로를 짧게 (마지막 2단계)
      const short = pathArgs[0].split("/").slice(-2).join("/");
      summary += ` → ${short}`;
    }
    if (flags.length > 0) summary += ` ${flags.join(" ")}`;
    return summary;
  }

  // python 계열
  const pyMatch = fullCmd.match(/python[3]?\s+(.+)/);
  if (pyMatch) return pyMatch[1].split("/").slice(-1)[0];

  // 일반적인 경우: 마지막 경로 컴포넌트
  const parts = fullCmd.split(/\s+/);
  const bin = parts[0].split("/").pop();
  const args = parts.slice(1).join(" ");
  if (args.length > 60) return `${bin} ${args.substring(0, 57)}...`;
  return args ? `${bin} ${args}` : bin;
}

let lastPortList = [];

// 포트 목록 조회
ipcMain.handle("get-ports", () => {
  return new Promise((resolve) => {
    exec("lsof -i -P -n | grep LISTEN", async (error, stdout) => {
      if (error || !stdout) {
        lastPortList = [];
        resolve([]);
        return;
      }
      const ports = parseLsofOutput(stdout);
      const pids = [...new Set(ports.map((p) => p.pid))];
      const cmdMap = await getFullCommands(pids);

      for (const p of ports) {
        p.fullCommand = cmdMap[String(p.pid)] || "";
        p.detail = summarizeCommand(p.fullCommand);
      }

      lastPortList = ports;
      resolve(lastPortList);
    });
  });
});

// 프로세스 종료
ipcMain.handle("kill-process", async (_event, pid) => {
  // PID로 현재 포트 정보에서 안전도 확인
  const portInfo = lastPortList.find((p) => p.pid === pid);
  const isSystem = portInfo && portInfo.safety === "system";

  const messageDetail = isSystem
    ? "이 프로세스는 시스템 프로세스입니다. 종료하면 시스템이 불안정해질 수 있습니다!"
    : "이 작업은 되돌릴 수 없습니다.";

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: isSystem ? "warning" : "question",
    buttons: ["취소", "종료"],
    defaultId: 0,
    cancelId: 0,
    title: isSystem ? "시스템 프로세스 종료 경고" : "프로세스 종료",
    message: `PID ${pid}${portInfo ? ` (${portInfo.command}:${portInfo.port})` : ""} 프로세스를 종료하시겠습니까?`,
    detail: messageDetail,
  });

  if (response === 0) {
    return { success: false, cancelled: true };
  }

  return new Promise((resolve) => {
    exec(`kill -9 ${pid}`, (error) => {
      if (error) {
        resolve({ success: false, error: error.message });
      } else {
        resolve({ success: true });
      }
    });
  });
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
