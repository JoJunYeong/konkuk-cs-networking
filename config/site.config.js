/**
 * KU CSE Quarterly Network 사이트 설정
 *
 * 새 분기 추가 방법:
 * 1. events 배열의 객체 하나를 복사합니다.
 * 2. id를 `YYYY-QN` 형식으로 바꾸고 featured를 새 회차에만 true로 둡니다.
 * 3. 실제 결제 연결 전까지 registration.mode는 "preview"로 유지합니다.
 */
window.NETWORKING_SITE_CONFIG = {
  previewMode: true,

  site: {
    brand: "KU CSE NETWORK",
    title: "건국 컴퓨터공학 동문 네트워킹 데이",
    contactEmail: "organizer@example.com",
    unofficialNotice:
      "건국대학교 공식 행사가 아닌 동문 주도 프로젝트이며, K/KU 캐릭터는 이 페이지 전용 비공식 그래픽입니다.",
    shareText: "건국 컴퓨터공학 동문 네트워킹 데이에 함께해요.",
  },

  theme: {
    accent: "#ff6b35",
    accentSoft: "#ffd9cb",
    ink: "#102a22",
    forest: "#123c2f",
    paper: "#f4f0e7",
    white: "#fffdf7",
  },

  // 공식 교표가 아닌 이 페이지 전용 비공식 K/KU 캐릭터입니다.
  // labels의 개수와 문구, motion(lively/gentle/still)을 자유롭게 바꿀 수 있습니다.
  decorations: {
    floatingMarks: {
      enabled: true,
      labels: ["K", "KU", "K", "K", "CSE", "KU", "K", "K"],
      motion: "lively",
    },
  },

  registration: {
    // preview: 네트워크 요청 없이 UI만 검증
    // external: providerUrl로 이동 (리틀리/이벤터스 등 외부 결제 페이지)
    // api: endpoint로 신청서를 POST하고 응답의 checkoutUrl로 이동
    mode: "preview",
    provider: "littly",
    providerUrl: "",
    // external 모드에서 true이면 이 페이지의 신청 폼을 숨기고 외부 제공자가 신청정보를 받습니다.
    providerHandlesForm: true,
    endpoint: "",
    confirmationEndpoint: "",
  },

  form: {
    fields: [
      {
        name: "name",
        label: "이름",
        type: "text",
        autocomplete: "name",
        placeholder: "홍길동",
        required: true,
        width: "half",
      },
      {
        name: "phone",
        label: "휴대전화",
        type: "tel",
        autocomplete: "tel",
        placeholder: "010-0000-0000",
        required: true,
        width: "half",
        pattern: "^(?:[0-9+ ]|\\(|\\)|-){9,20}$",
      },
      {
        name: "email",
        label: "이메일",
        type: "email",
        autocomplete: "email",
        placeholder: "alumni@example.com",
        required: true,
        width: "full",
      },
      {
        name: "graduationYear",
        label: "입학·졸업 연도",
        type: "text",
        autocomplete: "off",
        placeholder: "예: 15학번 / 2021년 졸업",
        required: true,
        width: "half",
      },
      {
        name: "currentRole",
        label: "현재 하는 일",
        type: "text",
        autocomplete: "organization-title",
        placeholder: "예: 백엔드 개발 / 창업 준비",
        required: true,
        width: "half",
      },
      {
        name: "interest",
        label: "이번 모임에서 나누고 싶은 주제",
        type: "select",
        required: true,
        width: "full",
        options: [
          "커리어 전환·이직",
          "개발·기술 트렌드",
          "창업·사이드 프로젝트",
          "채용·팀 빌딩",
          "대학원·연구",
          "가벼운 동문 교류",
        ],
      },
      {
        name: "intro",
        label: "짧은 자기소개",
        type: "textarea",
        placeholder: "함께 이야기 나누고 싶은 경험이나 고민을 2~3문장으로 남겨주세요.",
        required: false,
        width: "full",
        maxLength: 300,
      },
    ],
    privacySummary:
      "참가자 확인·결제 안내·행사 운영 목적으로 수집하며 행사 종료 90일 뒤 파기합니다.",
  },

  values: [
    {
      number: "01",
      title: "현업의 맥락",
      description: "직함보다 실제로 풀고 있는 문제와 시행착오를 나눕니다.",
    },
    {
      number: "02",
      title: "느슨한 연결",
      description: "당장 목적이 없어도 다음에 편하게 연락할 수 있는 사이를 만듭니다.",
    },
    {
      number: "03",
      title: "셋째 목요일의 리듬",
      description: "분기마다 다시 만나고, 연휴가 겹치는 회차만 한 주 앞당깁니다.",
    },
  ],

  audience: [
    "서울·판교·수원 등 서로 다른 지역에서 일하는 동문과 만나고 싶은 분",
    "커리어 전환, 채용, 창업에 관한 현실적인 경험을 듣고 싶은 분",
    "후배에게 시행착오를 나누거나 선배에게 질문하고 싶은 분",
    "분기마다 가볍게 돌아올 수 있는 동문 커뮤니티를 찾는 분",
  ],

  defaultFaq: [
    {
      question: "컴퓨터공학과 졸업생만 신청할 수 있나요?",
      answer:
        "운영 기준에 따라 재학생·복수전공·관련 학과 동문까지 범위를 조정할 수 있습니다. 실제 공개 전 참가 자격을 확정해 문구를 수정해 주세요.",
    },
    {
      question: "신청만 하면 참여가 확정되나요?",
      answer:
        "유료 회차는 결제 승인까지 완료되어야 참여가 확정됩니다. 개인 송금은 자동 확인되지 않으므로 예외 상황에서만 운영자가 수동 처리합니다.",
    },
    {
      question: "퇴근 후 조금 늦게 도착해도 되나요?",
      answer:
        "19시부터 체크인과 식사를 시작하고 놓치면 안 되는 공식 프로그램은 19시 30분에 엽니다. 판교·수원 등 원거리 참석자도 서두르지 않고 합류할 수 있게 운영합니다.",
    },
    {
      question: "취소와 환불은 어떻게 하나요?",
      answer:
        "회차별 환불 마감일과 수수료 기준을 실제 결제 페이지에 반드시 명시해야 합니다. 현재 화면은 예시이며 운영 정책 확정 후 교체합니다.",
    },
    {
      question: "참가자 정보는 다른 사람에게 공개되나요?",
      answer:
        "프로필 공유에 별도로 동의한 참가자의 최소 정보만 네트워킹 목적으로 제공합니다. 선택 동의하지 않아도 행사 신청에는 영향이 없습니다.",
    },
  ],

  events: [
    {
      id: "2026-Q2",
      quarter: "2026 Q2",
      sequence: "02",
      status: "closed",
      statusLabel: "마감",
      featured: false,
      eyebrow: "KONKUK CSE ALUMNI · QUARTER 02",
      titleLineOne: "두 번째 분기,",
      titleLineTwo: "더 넓어진 연결.",
      description: "지난 회차 예시입니다. 회차별 소개와 프로그램을 별도로 보관할 수 있습니다.",
      notice: "지난 회차 · 예시 데이터",
      dateLabel: "지난 회차",
      time: "종료",
      venue: "행사 종료",
      address: "",
      priceLabel: "마감",
      capacity: 50,
      applicationLabel: "신청 마감",
      programDescription: "지난 회차 프로그램 예시입니다.",
      agenda: [
        { time: "18:30", title: "체크인", description: "이름표와 대화 카드를 받고 가볍게 인사합니다." },
        { time: "19:00", title: "라이트닝 토크", description: "동문 3명이 최근의 도전과 배움을 짧게 공유합니다." },
        { time: "19:40", title: "테이블 네트워킹", description: "관심 주제별로 자리를 옮기며 대화합니다." },
        { time: "21:00", title: "클로징", description: "다음 분기의 주제를 제안하고 자유롭게 마무리합니다." },
      ],
    },
    {
      id: "2026-Q3",
      quarter: "2026 Q3",
      sequence: "03",
      status: "open",
      statusLabel: "신청 가능",
      featured: true,
      eyebrow: "KONKUK CSE ALUMNI · QUARTER 03",
      titleLineOne: "전공을 지나,",
      titleLineTwo: "서로의 다음을 잇는 밤.",
      description:
        "서울·판교·수원 등 서로 다른 현장에서 일하는 컴퓨터공학 동문이 분기에 한 번 홍대에 모여 경험과 기회를 나눕니다.",
      notice: "분기별 셋째 목요일 운영 원칙 · 연휴 인접 시 조정 · 현재 예시안",
      dateLabel: "2026년 9월 17일(목) · 예시안",
      time: "19:00 입장 · 19:30 시작",
      venue: "홍대입구 인근 · 장소 협의 중",
      address: "실제 장소 확정 후 입력",
      priceLabel: "참가비 확정 전",
      capacity: 60,
      applicationLabel: "참가 신청하기",
      applicationCopy: "신청 정보를 입력한 뒤 결제가 확인되면 참여가 확정됩니다.",
      aboutIntro:
        "19시부터 천천히 입장하고, 놓치면 안 되는 순서는 19시 30분에 시작합니다. 먼 곳에서 퇴근한 동문도 부담 없이 합류해 실제 다음 연락으로 이어지는 대화를 나눕니다.",
      quote: "지금 필요한 건 완벽한 소개가 아니라, 다음 대화를 시작할 한 사람일지도 모릅니다.",
      programDescription: "누구를 만날 수 있는지 미리 알고, 처음 온 사람도 실제 연결을 하나씩 남기도록 흐름을 설계합니다.",
      agenda: [
        { time: "19:00", title: "체크인 & 웰컴푸드", description: "먼 곳에서 퇴근한 동문도 천천히 도착해 이름표를 받고 첫 대화를 엽니다." },
        { time: "19:30", title: "공식 오프닝", description: "오늘 만날 사람과 대화 규칙을 짧게 소개합니다." },
        { time: "19:40", title: "동문 스포트라이트", description: "현업·연구·창업의 경험과 지금 풀고 있는 문제를 나눕니다." },
        { time: "20:20", title: "큐레이션 네트워킹", description: "커리어, 기술, 창업 등 관심사별로 자리를 옮기며 깊게 대화합니다." },
        { time: "21:30", title: "공식 종료 & 자유 대화", description: "연락을 이어갈 사람을 확인하고 희망자는 조금 더 이야기합니다." },
        { time: "22:00", title: "전체 마무리", description: "다음 분기 제안과 운영 피드백을 남기고 안전하게 귀가합니다." },
      ],
    },
    {
      id: "2026-Q4",
      quarter: "2026 Q4",
      sequence: "04",
      status: "upcoming",
      statusLabel: "예정",
      featured: false,
      eyebrow: "KONKUK CSE ALUMNI · QUARTER 04",
      titleLineOne: "올해의 마지막,",
      titleLineTwo: "다음 해를 먼저 만나는 밤.",
      description: "Q4 회차는 Q3 행사 종료 후 참가자 제안을 반영해 주제와 일정을 공개합니다.",
      notice: "분기별 셋째 목요일 원칙 · 알림 신청 기능은 추후 연결",
      dateLabel: "2026년 11월 셋째 목요일 · 예시안",
      time: "19:00 입장 · 19:30 시작",
      venue: "홍대입구 인근 · 추후 공개",
      address: "",
      priceLabel: "추후 공개",
      capacity: 60,
      applicationLabel: "오픈 예정",
      programDescription: "Q3 피드백을 반영해 프로그램을 확정합니다.",
      agenda: [
        { time: "TBA", title: "연말 동문 라운드업", description: "올해의 배움과 내년의 계획을 함께 정리합니다." },
        { time: "TBA", title: "Q4 테이블 토크", description: "참가자 제안 중 가장 많이 선택된 주제로 대화합니다." },
      ],
    },
  ],
};
