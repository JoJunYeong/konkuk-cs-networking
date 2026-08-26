# KU CSE Quarterly Network

건국대학교 컴퓨터공학 편입생·재학생·졸업생 네트워킹 데이를 분기마다 운영하기 위한 행사 페이지입니다. 2023년 실제 운영 기록을 개인정보 없이 정리한 아카이브와 동문회 회보를 닮은 편집형 디자인을 함께 담았습니다.

현재는 안전한 `preview` 모드입니다. 신청 폼의 화면 검증만 수행하며 개인정보 저장, 결제, 카카오 메시지 발송은 일어나지 않습니다.

## 바로 미리보기

```bash
cd /Users/junyeong-jo/Developer/konkuk-cs-networking
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. HTML 파일을 Finder에서 직접 열면 일부 브라우저 기능이 제한될 수 있으므로 로컬 서버를 권장합니다.

## 커스텀하는 곳

대부분의 변경은 [`config/site.config.js`](./config/site.config.js) 한 파일에서 끝납니다.

- `site`: 행사명, 운영 문의, 공유 문구
- `theme`: 포인트·배경·본문 색상
- `decorations.floatingMarks`: 비공식 K/KU/CSE 여백 마크와 움직임
- `form.fields`: 신청 문항, 필수 여부, 선택지
- `values`, `audience`, `defaultFaq`: 공통 소개 콘텐츠
- `events`: Q1~Q4 회차별 일정, 장소, 참가비, 정원, 프로그램
- `registration`: 미리보기·외부 결제·자체 API 모드

미리보기 상단의 `화면에서 커스텀`을 누르면 제목, 일정, 장소, 참가비, 정원, 색상과 움직이는 마크를 즉석에서 바꾸고 JSON을 복사할 수 있습니다. 마크는 이 페이지 전용 비공식 그래픽이며, 움직임은 `활발하게`, `살랑살랑`, `멈춤` 중에서 고를 수 있습니다. 이 변경은 브라우저에만 적용되며 파일을 자동 수정하지 않습니다.

지난 행사는 [`data/history.json`](./data/history.json)에서 바로 수정할 수 있습니다. 제목, 날짜, 장소, 참여 인원, 공개용 요약, 핵심 프로그램, 회고 메모를 지원합니다.

## 새 분기 추가

1. `config/site.config.js`의 `events` 객체 하나를 복사합니다.
2. `id`를 `2027-Q1`처럼 고유하게 바꿉니다.
3. 새 회차만 `featured: true`로 두고 나머지는 `false`로 바꿉니다.
4. `status`를 `upcoming`, `open`, `closed` 중 하나로 설정합니다.
5. 실제 일정, 장소, 참가비, 정원, 프로그램을 입력합니다.

`?quarter=2026-Q4`처럼 URL에 회차를 넣으면 해당 회차를 바로 공유할 수 있습니다.

## Notion에서 지난 기록 관리

Notion을 공개 사이트에서 직접 fetch하지 않습니다. GitHub Action이 매주 월요일과 수동 실행 시 `공개` 체크된 행만 읽어 정적 JSON으로 저장합니다.

1. Notion DB에 `공개`, `장소`, `참여 인원`, `요약`, `핵심 프로그램`, `공개 회고` 속성을 추가합니다.
2. 읽기 전용 Internal connection을 DB에 공유합니다.
3. GitHub Actions Secret에 `NOTION_TOKEN`을 추가합니다.
4. `Sync public history from Notion` workflow를 수동 실행합니다.

자세한 연결·개인정보 보호 절차는 [`docs/notion-sync.md`](./docs/notion-sync.md), 디자인 조사 근거는 [`docs/design-research.md`](./docs/design-research.md)를 확인하세요.

## 신청·결제 연결 방식

### 1. 외부 결제형: 가장 빠른 운영

리틀리 또는 이벤터스에서 신청·결제를 받고 이 프로젝트는 커스텀 랜딩 역할만 맡습니다.

```js
registration: {
  mode: "external",
  provider: "littly",
  providerUrl: "https://litt.ly/실제주소",
  providerHandlesForm: true,
}
```

`providerHandlesForm: true`이면 이 페이지의 신청 문항을 숨기고 외부 결제 페이지에서 신청정보를 받습니다. 결제 확인과 알림톡도 외부 제공자가 처리합니다.

### 2. 자체 API형: 완전 커스텀

```js
registration: {
  mode: "api",
  endpoint: "https://api.example.com/v1/registrations",
  confirmationEndpoint: "https://api.example.com/v1/registrations/status",
}
```

신청 API는 검증된 결제 URL을 `checkoutUrl`로 반환해야 합니다. 결제 승인, 중복 방지, 카카오 알림톡 발송 기준은 [`docs/payment-message-flow.md`](./docs/payment-message-flow.md)를 따릅니다.

### 3. 미리보기형: 현재 기본값

```js
registration: {
  mode: "preview"
}
```

실제 개인정보를 입력하지 않고 UI만 검수하는 단계입니다.

## GitHub Pages 배포

이 프로젝트는 빌드 과정이나 패키지 설치가 없는 정적 사이트입니다.

CSS·설정·JavaScript를 바꿔 재배포할 때는 기존 방문자의 GitHub Pages 캐시가 남지 않도록 `index.html`의 `?v=` 배포 버전도 함께 올립니다.

1. 변경 내용을 `main` 브랜치에 push합니다.
2. 저장소 `Settings → Pages`에서 `Deploy from a branch`, `main`, `/ (root)`를 유지합니다.
3. 배포 URL에서 데스크톱·모바일 화면, 신청 문항, 아카이브 개인정보 문구를 다시 검수합니다.

실제 신청 API 키, 결제 Secret, 알림톡 키는 GitHub 저장소나 브라우저 JavaScript에 넣지 않습니다.

## 공개 전 필수 체크

- 예시 일정·장소·금액을 실제 정보로 교체
- 주최 주체와 운영 문의 연락처 확정
- 참가 자격과 동문 확인 방식 확정
- 개인정보 수집 항목·보유기간·파기 기준 확정
- 취소·환불 기준과 마감일 명시
- 실제 소액 결제 → 승인 확인 → 확정 메시지 → 취소·환불 전 과정 테스트
- 카카오 메시지의 수신 성공과 실패 대체 경로 확인
- 건국대학교 공식 행사로 오인되지 않도록 관계와 명칭 검토
- Notion 공개 상세의 과거 송금 문구 삭제 또는 비공개 전환 검토
- 행사 사진 속 모든 참석자의 웹 공개 동의 확인

## 파일 구조

```text
.
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── data/
│   └── history.json
├── scripts/
│   └── sync-notion.mjs
├── .github/workflows/
│   └── sync-notion.yml
├── config/
│   └── site.config.js
└── docs/
    ├── design-research.md
    ├── notion-sync.md
    └── payment-message-flow.md
```
