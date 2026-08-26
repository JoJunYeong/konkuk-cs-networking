# KU CSE Quarterly Network

건국대학교 컴퓨터공학 동문 네트워킹 데이를 분기마다 운영하기 위한 모바일 우선 행사 페이지입니다.

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
- `decorations.floatingMarks`: 비공식 K/KU 캐릭터 문구와 움직임
- `form.fields`: 신청 문항, 필수 여부, 선택지
- `values`, `audience`, `defaultFaq`: 공통 소개 콘텐츠
- `events`: Q1~Q4 회차별 일정, 장소, 참가비, 정원, 프로그램
- `registration`: 미리보기·외부 결제·자체 API 모드

미리보기 상단의 `화면에서 커스텀`을 누르면 제목, 일정, 장소, 참가비, 정원, 색상과 떠다니는 마크를 즉석에서 바꾸고 JSON을 복사할 수 있습니다. 마크는 이 페이지 전용 비공식 그래픽이며, 움직임은 `활발하게`, `살랑살랑`, `멈춤` 중에서 고를 수 있습니다. 이 변경은 브라우저에만 적용되며 파일을 자동 수정하지 않습니다.

## 새 분기 추가

1. `config/site.config.js`의 `events` 객체 하나를 복사합니다.
2. `id`를 `2027-Q1`처럼 고유하게 바꿉니다.
3. 새 회차만 `featured: true`로 두고 나머지는 `false`로 바꿉니다.
4. `status`를 `upcoming`, `open`, `closed` 중 하나로 설정합니다.
5. 실제 일정, 장소, 참가비, 정원, 프로그램을 입력합니다.

`?quarter=2026-Q4`처럼 URL에 회차를 넣으면 해당 회차를 바로 공유할 수 있습니다.

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

1. 이 폴더를 별도 GitHub 저장소에 올립니다.
2. 저장소 `Settings → Pages`에서 `Deploy from a branch`를 선택합니다.
3. `main` 브랜치와 `/ (root)`를 선택합니다.
4. 배포 URL에서 모바일 화면, 신청 문항, 개인정보 문구를 다시 검수합니다.

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

## 파일 구조

```text
.
├── index.html
├── assets/
│   ├── app.js
│   └── styles.css
├── config/
│   └── site.config.js
└── docs/
    └── payment-message-flow.md
```
