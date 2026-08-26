# Notion 연혁 동기화

## 결론

브라우저가 Notion을 매번 직접 읽는 방식보다 아래 구조가 안전하고 안정적이다.

`Notion DB → 주 1회·수동 GitHub Action → data/history.json → GitHub Pages`

- Notion 토큰이 방문자 브라우저나 저장소에 노출되지 않는다.
- Notion 장애, CORS, 공개 페이지 HTML 변경이 사이트 로딩에 영향을 주지 않는다.
- 어떤 내용이 공개됐는지 Git commit으로 확인하고 되돌릴 수 있다.
- 분기 행사에는 실시간 동기화가 필요하지 않으므로 주 1회면 충분하다. 수정 직후에는 수동 실행할 수 있다.

## 현재 구현

- 원본 DB ID: `2f3ec978c1f146f8a0d1615b0aac62fa`
- 동기화 스크립트: `scripts/sync-notion.mjs`
- 예약 작업: `.github/workflows/sync-notion.yml`
- 공개 결과: `data/history.json`
- 예약 시각: 매주 월요일 06:17 KST
- API 버전: `2026-03-11`

현재 `data/history.json`에는 2023년 제1–3회 기록을 개인정보 없이 수동으로 먼저 반영했다. GitHub Secret이 없으면 예약 작업은 이 파일을 건드리지 않고 안전하게 종료한다.

## Notion DB에 추가할 공개용 속성

기존 `제목`, `활동 날짜`는 그대로 쓸 수 있다. 아래 속성을 추가하면 웹사이트에서 바로 관리하기 편하다.

| 속성명 | Notion 유형 | 필수 | 용도 |
| --- | --- | --- | --- |
| 공개 | Checkbox | 필수 | 체크된 행만 사이트에 반영하는 공개 게이트 |
| 장소 | Text | 권장 | 공개 가능한 행사 장소 |
| 참여 인원 | Number | 권장 | 기록상 참여 규모 |
| 요약 | Text | 권장 | 2–3문장의 공개용 행사 설명 |
| 핵심 프로그램 | Multi-select | 선택 | 발표, 취업 Q&A, 네트워킹 등 |
| 공개 회고 | Text | 선택 | 다음 회차에 남길 짧은 운영 메모 |
| 회차 | Number | 선택 | 없으면 제목의 `제N회`를 자동 해석 |

`공개` 속성이 없으면 스크립트가 동기화를 중단한다. 체크된 행이 하나도 없을 때도 기존 아카이브를 지우지 않고 중단한다.

## 최초 1회 연결

1. [Notion 공식 Authorization 안내](https://developers.notion.com/guides/get-started/authorization)에 따라 이 워크스페이스용 Internal connection을 만든다. 읽기 권한만 허용한다.
2. `Networking Day` 원본 데이터베이스에서 `••• → 연결 추가`로 방금 만든 connection을 공유한다.
3. GitHub 저장소에서 `Settings → Secrets and variables → Actions → New repository secret`으로 이동한다.
4. 이름을 `NOTION_TOKEN`으로 지정하고 connection token을 저장한다. 토큰을 파일, 채팅, 커밋에 넣지 않는다.
5. Notion DB의 공개할 세 행에 `공개`를 체크하고 공개용 속성을 채운다.
6. GitHub `Actions → Sync public history from Notion → Run workflow`를 한 번 실행한다.
7. Action 로그, 생성된 `data/history.json`, 실제 Pages 화면을 순서대로 확인한다.

## 개인정보 경계

동기화 스크립트는 데이터베이스 속성만 읽으며 상세 페이지 본문, 댓글, 커버, 사진 블록은 읽지 않는다. 결과 파일에 7자리 이상의 연속 숫자나 `phone`, `account`, `bank`, `email`, `photo`, `image` 같은 금지 필드가 들어오면 배포용 파일 작성을 거부한다.

현재 제3회 공개 상세 본문에는 과거 송금 정보가 남아 있다. 이 사이트에서는 해당 Notion 페이지로 링크하지 않았지만, Notion 공개 페이지를 계속 운영한다면 송금 문구 삭제 또는 페이지 비공개 전환을 별도로 검토해야 한다. 참석자 얼굴 사진도 홍보·웹 공개 동의가 확인되기 전에는 자동 사용하지 않는다.

## 직접 실행과 검증

공개 JSON 형식만 확인할 때는 토큰이 필요 없다.

```bash
node scripts/sync-notion.mjs --validate
```

실제 동기화는 저장소 밖 환경 변수로만 실행한다.

```bash
NOTION_TOKEN="..." \
NOTION_DATABASE_ID="2f3ec978c1f146f8a0d1615b0aac62fa" \
node scripts/sync-notion.mjs
```

`NOTION_ALLOW_UNFILTERED=true`를 설정하면 `공개` 체크 없이도 읽을 수 있지만, 초안 제목이 노출될 수 있어 운영에서는 권장하지 않는다.

## 공식 API 근거

- [Query a data source](https://developers.notion.com/reference/query-a-data-source): `POST /v1/data_sources/{data_source_id}/query`
- [Retrieve a database](https://developers.notion.com/reference/retrieve-database): database에서 `data_sources` ID 확인
- [Authorization](https://developers.notion.com/guides/get-started/authorization): connection 공유와 토큰 보관 원칙
- [Versioning](https://developers.notion.com/reference/versioning): 현재 `Notion-Version: 2026-03-11`
