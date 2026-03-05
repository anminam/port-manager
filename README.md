# Port Manager

macOS에서 열린 포트를 한눈에 확인하고, 불필요한 프로세스를 즉시 종료할 수 있는 경량 GUI 앱입니다.

![Tauri](https://img.shields.io/badge/Tauri_2-Rust-orange?logo=tauri&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
![Size](https://img.shields.io/badge/size-3MB-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

## 주요 기능

- **포트 스캔** — 현재 LISTEN 중인 모든 포트를 테이블로 표시
- **안전도 분류** — 포트를 3단계로 자동 분류
  - 🟢 **개발** — node, python 등 개발 프로세스 (3000, 5173, 8080 등)
  - 🟡 **기타** — 분류 미확정 포트
  - 🔴 **시스템** — well-known 포트 및 시스템 프로세스
- **프로세스 상세 정보** — 각 포트가 실제로 실행 중인 전체 명령어 표시
- **프로세스 종료** — Kill 버튼으로 즉시 종료 (확인 다이얼로그 포함)
- **검색 & 필터** — 포트 번호, 프로세스명, PID로 실시간 검색
- **분류별 필터 탭** — 전체 / 개발 / 기타 / 시스템

## 설치

[Releases](https://github.com/anminam/port-manager/releases) 에서 `.dmg` 파일을 다운로드하세요.

1. **Port Manager_x.x.x_aarch64.dmg** 다운로드
2. `.dmg` 파일 열기
3. Port Manager 앱을 Applications 폴더로 드래그

### "손상되었기 때문에 열 수 없습니다" 오류 해결

코드사이닝이 없는 앱이라 macOS에서 차단할 수 있습니다. 터미널에서 아래 명령어를 실행하세요:

```bash
xattr -cr /Applications/Port\ Manager.app
```

> Apple Silicon (M1/M2/M3/M4) Mac 전용

## 소스에서 빌드

```bash
# 사전 요구사항: Rust, Node.js
npm install
npm run build
```

빌드 결과물은 `src-tauri/target/release/bundle/` 에 생성됩니다.

## 프로젝트 구조

```
port-manager/
├── dist-html/
│   └── index.html       # 프론트엔드 (HTML/CSS/JS)
├── src-tauri/
│   ├── src/lib.rs       # Rust 백엔드 (포트 스캔, kill, 분류)
│   ├── tauri.conf.json  # Tauri 설정
│   └── icons/           # 앱 아이콘
└── scripts/
    └── generate-icon.js # 아이콘 생성 스크립트
```

## 기술 스택

- **Tauri 2** + **Rust** — 경량 네이티브 앱 (3MB)
- **lsof** — macOS 포트 조회
- **macOS WebKit** — 시스템 내장 웹뷰 (Chromium 미포함)

## 라이선스

MIT
