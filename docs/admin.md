# 관리자 화면 운영

## 접속과 로그인

GitHub Pages 공개 주소 뒤에 `/admin.html`을 붙여 접속한다. 화면에는 짧은 관리자 아이디를 입력하지만, 실제 로그인 확인은 Firebase Authentication이 맡는다.

- 비밀번호는 GitHub 저장소와 브라우저 코드에 저장하지 않는다.
- 로그인 상태는 현재 브라우저 탭 세션에만 유지한다.
- 관리자 화면은 검색엔진에 노출하지 않도록 `noindex, nofollow`를 적용했다.
- 화면 주소를 아는 것만으로는 자료를 저장할 수 없다. Firestore 보안 규칙이 로그인 계정을 다시 확인한다.

## 관리할 수 있는 내용

### 분기별 행사

- 새 분기 만들기와 목록 제외
- 첫 화면에 보여줄 회차 선택
- 신청 상태, 일정, 시간, 장소, 참가비, 정원 수정
- 큰 제목, 안내 문구, 모임 소개, 진행 순서 수정

회차 ID는 `2027-Q1` 형식을 사용한다. 첫 화면 회차를 여러 개 체크하면 현재 편집 중인 회차 하나만 남긴다.

### 지난 기록

- 날짜, 장소, 참여 인원, 공개용 설명 수정
- 주요 순서와 운영 메모 기록
- 새 기록 추가와 목록 제외

이름, 연락처, 이메일, 계좌번호, 참석자 사진은 넣지 않는다. 관리 화면은 긴 숫자열과 이메일 주소처럼 개인정보일 가능성이 큰 입력을 저장 전에 한 번 더 막는다.

## 저장 구조

관리자 화면은 Firestore의 다음 두 문서만 읽고 쓴다.

```text
siteData/events
siteData/history
```

공개 페이지는 같은 문서를 읽기 전용으로 불러온다. Firestore가 일시적으로 응답하지 않거나 문서가 아직 없으면 저장소의 `config/site.config.js`와 `data/history.json`을 보여준다.

## 보안 규칙 변경

로컬 규칙은 `firestore.rules`에 있다. Firebase CLI를 연결한 환경에서는 다음 명령으로 같은 규칙을 배포할 수 있다.

```bash
firebase deploy --only firestore:rules --project ku-cse-quarterly-admin
```

관리자 계정을 바꾸면 다음 세 곳을 함께 확인한다.

1. Firebase Authentication의 사용자 계정
2. `config/firebase.config.js`의 화면용 아이디와 로그인 별칭
3. `firestore.rules`의 허용 계정 UID

클라이언트의 Firebase 웹 설정은 공개 식별자이며 비밀키가 아니다. 실제 쓰기 권한은 Authentication과 Firestore 규칙이 결정한다. 서비스 계정 키, Firebase Admin SDK 키, 비밀번호는 저장소에 넣지 않는다.

## Notion과 함께 쓸 때

Notion 동기화는 `data/history.json` 예비본만 갱신한다. 관리자 화면에서 Firestore 기록을 만든 뒤에는 Firestore가 공개 페이지의 기준이므로 Notion 변경이 자동으로 덮어쓰지 않는다. 평소 운영은 관리자 화면 하나로 하고, Notion은 과거 원문 보관이나 정적 예비본 갱신에만 쓰는 것을 권장한다.
