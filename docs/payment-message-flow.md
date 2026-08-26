# 결제 승인과 참여 확정 메시지 연동 계약

이 문서는 `registration.mode = "api"`로 완전 커스텀 운영할 때 필요한 최소 백엔드 계약입니다. GitHub Pages는 화면만 담당하고 아래 처리는 서버 또는 서버리스 함수가 담당해야 합니다.

## 권장 상태 흐름

```text
draft
  → pending_payment
  → paid
  → message_queued
  → confirmed

pending_payment → expired
paid → canceled → refunded
pending_manual_transfer → paid
```

브라우저가 결제 성공 주소로 돌아온 것만으로 `paid` 또는 `confirmed`로 바꾸면 안 됩니다. 결제사의 승인 API 응답이나 서명이 검증된 웹훅을 서버가 확인해야 합니다.

## 1. 신청 생성

`POST /v1/registrations`

요청 예시:

```json
{
  "eventId": "2026-Q3",
  "fields": {
    "name": "신청자 이름",
    "phone": "010-0000-0000",
    "email": "alumni@example.com",
    "graduationYear": "15학번",
    "currentRole": "백엔드 개발",
    "interest": "개발·기술 트렌드",
    "intro": ""
  },
  "consents": {
    "privacy": true,
    "networkingProfile": false
  }
}
```

서버가 수행할 일:

1. 현재 모집 중인 `eventId`인지 확인
2. 금액과 정원을 서버 데이터로 결정
3. 전화번호·이메일 형식과 필수 동의 확인
4. 중복 신청 정책 적용
5. `pending_payment` 신청 레코드 생성
6. 결제사에 주문 생성
7. 신청 ID와 결제 거래 ID를 매핑

응답 예시:

```json
{
  "registrationId": "reg_01J...",
  "checkoutUrl": "https://payment-provider.example/checkout/...",
  "expiresAt": "2026-09-20T09:30:00+09:00"
}
```

## 2. 결제 승인

결제 웹훅 또는 승인 콜백에서 다음을 모두 검증합니다.

- 웹훅 서명 또는 제공자 인증
- 주문 ID와 신청 ID 매핑
- 결제 금액과 서버의 회차별 참가비 일치
- 이미 처리한 거래인지 확인하는 멱등성 키
- 결제 상태가 실제 승인 완료인지 확인

한 결제에 메시지가 두 번 나가지 않도록 `payment_transaction_id`와 `message_type` 조합에 고유 제약을 두는 방식이 안전합니다.

## 3. 확정 메시지

`paid` 전환이 데이터베이스에 커밋된 뒤 메시지 작업을 큐에 넣습니다.

예시 본문:

```text
[참여 확정]
#{name}님, #{event_name} 참가비 결제가 완료되어 참여가 확정되었습니다.

일시: #{event_datetime}
장소: #{venue}
입장 안내: #{checkin_guide}
취소·문의: #{contact}
```

메시지에는 주문번호 전체, 과도한 개인정보, 광고 문구를 넣지 않습니다. 카카오 알림톡 실패 시 문자 또는 이메일로 재시도하고 각 시도의 제공자 응답 ID와 상태를 기록합니다.

## 4. 일반 송금 예외 처리

개인 카카오페이 송금이나 운영자 계좌로 직접 받은 돈은 결제 웹훅이 없습니다. 자동 확정으로 가장하지 않고 아래처럼 분리합니다.

1. 신청 상태를 `pending_manual_transfer`로 생성
2. 운영자가 입금자명·금액·회차를 대조
3. 관리자 화면에서 명시적으로 `paid` 승인
4. 승인 로그에 담당자와 시각 기록
5. 동일한 메시지 큐로 확정 안내 발송

은행 입출금 알림이나 개인 휴대전화 알림을 스크래핑해 자동 승인하는 방식은 신뢰성과 보안 때문에 사용하지 않습니다.

## 5. 최소 데이터 구조

```text
events
  id, quarter, status, starts_at, venue, capacity, price, refund_policy_version

registrations
  id, event_id, status, name, phone_encrypted, email_encrypted,
  graduation_year, current_role, interest, consent_version,
  created_at, paid_at, canceled_at

payments
  id, registration_id, provider, provider_transaction_id,
  amount, status, raw_event_hash, created_at

message_deliveries
  id, registration_id, type, provider_message_id,
  status, attempt_count, last_error_code, sent_at

audit_log
  id, actor, action, target_type, target_id, created_at
```

개인정보는 운영 기간에 필요한 최소 항목만 보관하고, 회차별 고지한 보유기간이 끝나면 파기 작업과 기록을 남깁니다.

## 6. 운영 완료의 증거

다음 항목은 서로 다른 완료 상태입니다.

- 신청 API가 200을 반환함
- 결제사가 승인 완료로 조회됨
- 내부 신청 상태가 `paid`로 저장됨
- 메시지 제공자가 발송 성공을 반환함
- 참가자가 실제 메시지를 수신함
- 현장에서 출석이 확인됨

관리 화면과 로그에서도 이 상태들을 합쳐서 `완료` 하나로 표시하지 않는 것을 권장합니다.
