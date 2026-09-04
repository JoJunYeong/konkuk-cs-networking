# KU CSE Quarterly Network

건국대학교 컴퓨터공학 편입생·재학생·졸업생 네트워킹 데이를 분기마다 운영하기 위한 행사 페이지입니다. 2023년 실제 운영 기록을 개인정보 없이 정리한 아카이브와 동문회 회보를 닮은 편집형 디자인을 함께 담았습니다.

참가 신청은 회차별로 외부 행사 플랫폼 또는 자체 계좌이체 방식을 고를 수 있습니다. 자체 방식에서는 이름·휴대전화·입금자명만 비공개 Firestore 문서에 접수하고, 운영자가 은행 입금 내역을 일괄 대조한 뒤 참여 확정으로 바꿉니다. 신청자가 체크한 `입금 완료`는 입금확인 요청이지 결제 확정이 아닙니다.

## 바로 미리보기

```bash
cd /Users/junyeong-jo/Developer/konkuk-cs-networking
python3 -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. HTML 파일을 Finder에서 직접 열면 일부 브라우저 기능이 제한될 수 있으므로 로컬 서버를 권장합니다.

## 커스텀하는 곳

공개 페이지의 행사 일정과 지난 기록은 `/admin.html`에서 관리합니다. 색상, 신청 문항, 결제 방식처럼 구조에 가까운 설정은 [`config/site.config.js`](./config/site.config.js)에서 바꿉니다.

- `site`: 행사명, 운영 문의, 공유 문구
- `theme`: 포인트·배경·본문 색상
- `decorations.floatingMarks`: 비공식 K/KU/CSE 여백 마크와 움직임
- `form.fields`: 신청 문항, 필수 여부, 선택지
- `values`, `audience`, `defaultFaq`: 공통 소개 콘텐츠
- `events`: Q1~Q4 회차별 일정, 장소, 참가비, 정원, 프로그램
- `registration`: 기본 신청 방식과 외부 결제·자체 신청 연결 설정

미리보기 상단의 `화면에서 커스텀`을 누르면 제목, 일정, 장소, 참가비, 정원, 색상과 움직이는 마크를 즉석에서 바꾸고 JSON을 복사할 수 있습니다. 마크는 이 페이지 전용 비공식 그래픽이며, 움직임은 `활발하게`, `살랑살랑`, `멈춤` 중에서 고를 수 있습니다. 이 변경은 브라우저에만 적용되며 파일을 자동 수정하지 않습니다.

[`data/history.json`](./data/history.json)은 Firestore 자료가 없거나 불러오지 못했을 때 보여줄 정적 예비본입니다.

## 관리자 화면

공개 주소 뒤에 `/admin.html`을 붙여 접속합니다. Firebase Authentication으로 로그인하며 비밀번호는 저장소, HTML, JavaScript 어디에도 저장하지 않습니다.

관리자 화면에서 할 수 있는 일:

- 새 분기 행사 추가, 수정, 목록 제외
- 첫 화면에 표시할 회차 선택
- 일정, 장소, 참가비, 정원, 진행 순서 수정
- 회차별 외부 신청 URL 또는 자체 계좌이체 계좌 연결
- 신청자·입금 상태 일괄 대조와 확정
- 취소·환불 요청 확인, 처리 완료 기록과 환불 계좌 파기
- 지난 행사 기록 추가, 수정, 목록 제외
- 저장 직후 공개 페이지 반영

Firebase 연결, 보안 규칙, 계정 교체 방법은 [`docs/admin.md`](./docs/admin.md)에 정리했습니다.

## 코드에서 새 분기 추가

일반 운영은 관리자 화면을 사용하면 됩니다. 아래는 Firestore 자료가 아직 없을 때 쓰는 정적 예비본을 코드에서 바꾸는 방법입니다.

1. `config/site.config.js`의 `events` 객체 하나를 복사합니다.
2. `id`를 `2027-Q1`처럼 고유하게 바꿉니다.
3. 새 회차만 `featured: true`로 두고 나머지는 `false`로 바꿉니다.
4. `status`를 `upcoming`, `open`, `closed` 중 하나로 설정합니다.
5. 실제 일정, 장소, 참가비, 정원, 프로그램을 입력합니다.

`?quarter=2026-Q4`처럼 URL에 회차를 넣으면 해당 회차를 바로 공유할 수 있습니다.

## Notion에서 지난 기록 가져오기

Notion을 공개 사이트에서 직접 fetch하지 않습니다. 선택 사항인 GitHub Action이 `공개` 체크된 행만 읽어 정적 예비본인 `data/history.json`으로 저장합니다.

관리자 화면에서 한 번이라도 지난 기록을 저장하면 Firestore 자료가 공개 페이지의 기준이 됩니다. 그 뒤 Notion Action을 실행해도 운영 중인 Firestore 자료를 덮어쓰지 않습니다. 평소에는 관리자 화면 하나를 기준으로 쓰고, Notion은 과거 자료 정리나 예비본 생성에만 사용하는 편이 단순합니다.

1. Notion DB에 `공개`, `장소`, `참여 인원`, `요약`, `핵심 프로그램`, `공개 회고` 속성을 추가합니다.
2. 읽기 전용 Internal connection을 DB에 공유합니다.
3. GitHub Actions Secret에 `NOTION_TOKEN`을 추가합니다.
4. `Sync public history from Notion` workflow를 수동 실행합니다.

자세한 연결·개인정보 보호 절차는 [`docs/notion-sync.md`](./docs/notion-sync.md), 디자인 조사 근거는 [`docs/design-research.md`](./docs/design-research.md)를 확인하세요.

## 신청·결제 연결 방식

### 1. 자체 계좌이체형

관리자 화면에서 회차의 신청 방식을 `자체 사이트 · 계좌이체`로 고르고 은행·예금주·계좌번호·입금액·환불 마감을 입력합니다. `신청 가능` 상태와 계좌 정보가 모두 갖춰져야 공개 신청과 Firestore 모집 게이트가 함께 열립니다.

신청자는 송금 뒤 이름, 휴대전화, 실제 입금자명을 입력하고 입금확인을 요청합니다. 운영자는 `신청·입금` 탭에 은행 내역의 `입금자명[TAB]금액` 두 열을 붙여 넣어 유일하게 일치한 건을 한 번에 확정합니다. 동명이인과 중복 건은 자동 선택하지 않습니다.

직접 계좌이체에는 결제 웹훅이 없으므로 실제 은행 내역 확인과 환불 송금 자체는 자동화되지 않습니다. 완전 자동 승인·환불이 필요하면 PG 또는 오픈뱅킹 계약과 서버 검증이 필요합니다.

### 2. 외부 결제형: 기존 회차 호환

온오프믹스에서 신청·결제·참가자 명단·공지·환불을 운영하고 이 프로젝트는 커스텀 랜딩 역할만 맡습니다. ZADU 결제 코드나 결제 식별자를 공유하지 않습니다.

```js
registration: {
  mode: "external",
  provider: "onoffmix",
  providerUrl: "", // 회차별 registrationUrl을 우선 사용
  providerHandlesForm: true,
}
```

`providerHandlesForm: true`이면 이 페이지의 신청 문항을 숨기고 외부 페이지에서 신청정보를 받습니다. 일반 운영에서는 `/admin.html`에서 회차별 `공개 신청 URL`만 붙이면 되며 코드 배포는 필요 없습니다. 자세한 순서는 [`docs/onoffmix-operations.md`](./docs/onoffmix-operations.md)를 따릅니다.

### 3. 자체 API형: 완전 커스텀

```js
registration: {
  mode: "api",
  endpoint: "https://api.example.com/v1/registrations",
  confirmationEndpoint: "https://api.example.com/v1/registrations/status",
}
```

신청 API는 검증된 결제 URL을 `checkoutUrl`로 반환해야 합니다. 결제 승인, 중복 방지, 카카오 알림톡 발송 기준은 [`docs/payment-message-flow.md`](./docs/payment-message-flow.md)를 따릅니다.

### 4. 미리보기형

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

실제 신청 API 키, 결제 Secret, 알림톡 키는 GitHub 저장소나 브라우저 JavaScript에 넣지 않습니다. 자체 계좌이체용 참가자·환불 자료는 공개 `siteData` 문서가 아니라 관리자만 읽는 별도 컬렉션에 저장합니다.

## 공개 전 필수 체크

- 예시 일정·장소·금액을 실제 정보로 교체
- 주최 주체와 운영 문의 연락처 확정
- 참가 자격과 동문 확인 방식 확정
- 개인정보 수집 항목·보유기간·파기 기준 확정
- 취소·환불 기준과 마감일 명시
- 실제 소액 송금 → 입금확인 대기 → 관리자 확정 → 취소 요청 → 환불 및 계좌정보 파기 전 과정 테스트
- 외부 플랫폼의 이메일·문자 공지 수신과 실패 대체 경로 확인
- 건국대학교 공식 행사로 오인되지 않도록 관계와 명칭 검토
- Notion 공개 상세의 과거 송금 문구 삭제 또는 비공개 전환 검토
- 행사 사진 속 모든 참석자의 웹 공개 동의 확인

## 파일 구조

```text
.
├── index.html
├── admin.html
├── assets/
│   ├── admin.css
│   ├── admin.js
│   ├── app.js
│   └── styles.css
├── data/
│   └── history.json
├── scripts/
│   └── sync-notion.mjs
├── .github/workflows/
│   └── sync-notion.yml
├── config/
│   ├── firebase.config.js
│   └── site.config.js
├── firebase.json
├── firestore.rules
└── docs/
    ├── admin.md
    ├── design-research.md
    ├── notion-sync.md
    └── payment-message-flow.md
```
