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
    unofficialNotice: "건국대학교 공식 행사가 아닌 동문 주도 네트워킹 프로젝트입니다.",
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
      title: "분기마다 한 번",
      description: "한 번의 명함 교환으로 끝나지 않도록 꾸준한 리듬을 만듭니다.",
    },
  ],

  audience: [
    "다른 업계·직무의 동문과 편하게 이야기하고 싶은 분",
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
        "서로 다른 현장에서 일하는 컴퓨터공학 동문이 한 분기에 한 번 만나 경험과 기회를 나눕니다.",
      notice: "비공식 동문 네트워킹 프로젝트 · 실제 행사 정보 입력 전 데모",
      dateLabel: "2026년 9월 · 일정 협의 중",
      time: "16:00–20:00 · 예시",
      venue: "서울 · 장소 협의 중",
      address: "실제 장소 확정 후 입력",
      priceLabel: "참가비 확정 전",
      capacity: 60,
      applicationLabel: "참가 신청하기",
      applicationCopy: "신청 정보를 입력한 뒤 결제가 확인되면 참여가 확정됩니다.",
      aboutIntro:
        "취업 설명회도, 딱딱한 총회도 아닙니다. 비슷한 출발점에서 각자의 길을 만든 사람들이 편하게 묻고 답하는 자리입니다.",
      quote: "지금 필요한 건 완벽한 소개가 아니라, 다음 대화를 시작할 한 사람일지도 모릅니다.",
      programDescription: "처음 온 사람도 자연스럽게 섞일 수 있도록 대화의 흐름을 설계합니다.",
      agenda: [
        { time: "16:00", title: "반가운 체크인", description: "관심 주제가 담긴 이름표를 받고 첫 대화를 시작합니다." },
        { time: "16:30", title: "동문 라이트닝", description: "현업·연구·창업에서 얻은 배움을 10분씩 공유합니다." },
        { time: "17:20", title: "테이블 토크", description: "커리어, 기술, 창업 등 관심사별 소그룹 대화를 엽니다." },
        { time: "18:40", title: "오픈 네트워킹", description: "다과와 함께 자유롭게 연결하고 다음 만남을 약속합니다." },
        { time: "20:00", title: "다음 분기 예고", description: "Q4 주제 제안과 운영 피드백으로 마무리합니다." },
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
      notice: "예정 회차 · 알림 신청 기능은 추후 연결",
      dateLabel: "2026년 12월 예정",
      time: "추후 공개",
      venue: "추후 공개",
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
