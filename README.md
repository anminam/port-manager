# Port Manager

macOS에서 열린 포트를 한눈에 확인하고, 불필요한 프로세스를 즉시 종료할 수 있는 GUI 앱입니다.

![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple)
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

## 스크린샷

> `npm start`로 실행 후 확인

## 설치 & 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm start
```

## 빌드 (배포용)

```bash
# .dmg + .zip 생성
npm run build

# .dmg만 생성
npm run build:dmg
```

빌드 결과물은 `dist/` 폴더에 생성됩니다.

## 프로젝트 구조

```
check-port/
├── main.js          # Electron 메인 프로세스 (포트 스캔, kill, IPC)
├── preload.js       # contextBridge 보안 통신
├── index.html       # GUI (테이블, 검색, 필터, 아이콘)
├── icon.icns        # macOS 앱 아이콘
├── icon.iconset/    # 아이콘 원본 PNG
└── scripts/
    └── generate-icon.js  # 아이콘 생성 스크립트
```

## 기술 스택

- **Electron** — 크로스 플랫폼 데스크톱 앱 프레임워크
- **lsof** — macOS 포트 조회 (`lsof -i -P -n | grep LISTEN`)
- **kill -9** — 프로세스 종료
- **contextBridge** — 보안 IPC 통신 (`nodeIntegration: false`)

## 라이선스

MIT
