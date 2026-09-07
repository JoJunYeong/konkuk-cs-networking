/**
 * KU CSE Quarterly Network 사이트 설정
 *
 * 새 분기 추가 방법:
 * 1. events 배열의 객체 하나를 복사합니다.
 * 2. id를 `YYYY-QN` 형식으로 바꾸고 featured를 새 회차에만 true로 둡니다.
 * 3. 회차별 registrationMode를 external 또는 manual_transfer로 정합니다.
 */
window.NETWORKING_SITE_CONFIG = {
  previewMode: false,

  site: {
    brand: "KU meet",
    title: "건국 컴공 네트워킹",
    contactEmail: "",
    unofficialNotice:
      "건국대학교 컴퓨터공학 선후배가 직접 준비하는 비공식 모임입니다.",
    shareText: "건국대 컴공 선후배가 분기마다 모입니다. 이번 모임에서 만나요.",
  },

  theme: {
    accent: "#147d59",
    accentSoft: "#e7f7ef",
    ink: "#172c25",
    forest: "#124e3a",
    paper: "#f7faf8",
    white: "#ffffff",
  },

  // 공식 교표가 아닌 이 페이지 전용 비공식 K/KU 캐릭터입니다.
  // labels의 개수와 문구, motion(lively/gentle/still)을 자유롭게 바꿀 수 있습니다.
  decorations: {
    floatingMarks: {
      enabled: true,
      labels: ["K", "KU", "CSE"],
      motion: "gentle",
    },
  },

  registration: {
    // preview: 네트워크 요청 없이 UI만 검증
    // external: 회차별 registrationUrl 또는 providerUrl로 이동
    // manual_transfer: 자체 신청서와 계좌이체 입금확인 요청 사용
    // api: endpoint로 신청서를 POST하고 응답의 checkoutUrl로 이동
    mode: "manual_transfer",
    provider: "onoffmix",
    providerLabel: "온오프믹스",
    providerUrl: "",
    providerCreateUrl: "https://www.onoffmix.com/event/add",
    providerAdminUrl: "https://www.onoffmix.com/account/opened/event",
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
        maxLength: 40,
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
        maxLength: 20,
      },
      {
        name: "depositorName",
        label: "입금자명",
        type: "text",
        autocomplete: "off",
        placeholder: "통장에 표시되는 이름",
        required: true,
        width: "full",
        maxLength: 40,
      },
    ],
    privacySummary:
      "수집 항목: 이름·휴대전화·입금자명. 신청 확인·입금 대조·취소 및 행사 운영에만 사용하며 행사 종료 90일 뒤 파기합니다.",
  },

  values: [
    {
      number: "01",
      title: "요즘 하는 일",
      description: "회사나 학교에서 맡고 있는 일, 막혔던 일, 잘된 일을 나눕니다.",
    },
    {
      number: "02",
      title: "선후배에게 묻기",
      description: "취업, 대학원, 창업처럼 혼자 알아보기 어려운 이야기를 편하게 물어봅니다.",
    },
    {
      number: "03",
      title: "석 달에 한 번",
      description: "부담스럽게 자주 모이지 않고, 한 분기에 한 번 안부를 잇습니다.",
    },
  ],

  audience: [
    "건국대학교 컴퓨터공학과 선후배를 만나고 싶은 분",
    "취업, 이직, 대학원, 창업 이야기를 직접 듣고 싶은 분",
    "후배에게 경험을 나누거나 선배에게 궁금한 점을 묻고 싶은 분",
    "오랜만에 학교 사람들과 편하게 저녁을 먹고 싶은 분",
  ],

  defaultFaq: [
    {
      question: "컴퓨터공학과 졸업생만 신청할 수 있나요?",
      answer:
        "편입생을 중심으로 시작했지만, 건국대학교 컴퓨터공학과와 인연이 있는 재학생과 졸업생도 신청할 수 있습니다.",
    },
    {
      question: "신청만 하면 참여가 확정되나요?",
      answer:
        "유료 회차는 외부 신청 페이지에서 결제까지 완료해야 참여가 확정됩니다. 신청·결제 상태는 외부 플랫폼의 신청 내역에서 확인할 수 있습니다.",
    },
    {
      question: "퇴근 후 조금 늦게 도착해도 되나요?",
      answer:
        "회차마다 다릅니다. 늦게 와도 되는 시간은 일정이 정해지는 대로 신청 페이지에 적어두겠습니다.",
    },
    {
      question: "취소와 환불은 어떻게 하나요?",
      answer:
        "환불 마감일과 방법은 결제 전에 외부 신청 페이지에서 안내합니다. 신청 뒤에는 해당 페이지의 신청 내역에서 취소·환불을 요청할 수 있습니다.",
    },
    {
      question: "참가자 정보는 다른 사람에게 공개되나요?",
      answer:
        "아닙니다. 참가자 소개는 따로 동의한 분의 최소 정보만 행사 당일에 공유합니다. 동의하지 않아도 신청할 수 있습니다.",
    },
  ],

  manualTransferFaq: [
    { question: "처음 가거나 혼자 가도 괜찮나요?", answer: "물론이에요. 건국대학교 컴퓨터공학과와 인연이 있는 편입생, 재학생, 졸업생 모두 환영합니다. 이름표를 받고 선후배와 편하게 인사해 주세요." },
    {
      question: "입금완료 버튼을 누르면 신청이 끝나나요?",
      answer:
        "네. 참가비를 보낸 뒤 입금완료 버튼을 누르고 신청번호가 표시되면 참여신청은 완료됩니다. 운영자가 실제 입금 내역을 확인한 뒤 참여 확정과 장소를 입력한 연락처로 안내합니다.",
    },
    {
      question: "입금자명이 신청자 이름과 달라도 되나요?",
      answer:
        "가능합니다. 실제 송금할 때 사용한 입금자명을 신청서에 정확히 적어 주세요. 같은 이름의 입금이 여러 건이면 확인이 늦어질 수 있습니다.",
    },
    {
      question: "취소와 환불은 어떻게 하나요?",
      answer:
        "환불 마감 전 이 페이지의 취소·환불 요청에서 신청번호와 휴대전화, 환불 계좌를 입력해 주세요. 운영자가 확인한 뒤 계좌이체로 환불하며 처리 완료 후 계좌정보를 지웁니다.",
    },
    {
      question: "참가자 정보는 다른 사람에게 공개되나요?",
      answer:
        "아닙니다. 이름, 휴대전화, 입금자명과 환불 계좌는 관리자만 확인할 수 있으며 행사 운영과 정산 외 목적으로 사용하지 않습니다.",
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
      titleLineOne: "지난 2분기에는",
      titleLineTwo: "이렇게 만났습니다.",
      description: "지난 회차의 일정과 진행 순서를 확인할 수 있습니다.",
      notice: "지난 회차 · 예시 데이터",
      dateLabel: "지난 회차",
      time: "종료",
      venue: "행사 종료",
      address: "",
      priceLabel: "마감",
      capacity: 50,
      registrationMode: "external",
      registrationProvider: "onoffmix",
      registrationUrl: "",
      locationNotice: "지난 회차입니다.",
      applicationLabel: "신청 마감",
      programDescription: "지난 회차에 진행한 순서입니다.",
      agenda: [
        { time: "18:30", title: "도착·이름표 받기", description: "이름표를 받고 먼저 온 사람들과 인사합니다." },
        { time: "19:00", title: "선배 세 사람 이야기", description: "최근 맡은 일과 시행착오를 짧게 들었습니다." },
        { time: "19:40", title: "주제별 대화", description: "관심 있는 주제의 테이블로 옮겨 이야기했습니다." },
        { time: "21:00", title: "마무리", description: "다음 모임에서 다룰 이야기를 받고 자유롭게 마쳤습니다." },
      ],
    },
    {
      id: "2026-Q3",
      quarter: "2026 Q3",
      sequence: "03",
      status: "open",
      statusLabel: "신청 가능",
      featured: true,
      revision: 1788746544110,
      eyebrow: "2026 Q3 · 건국대 컴공 선후배의 저녁 모임",
      titleLineOne: "학교 밖에서,",
      titleLineTwo: "우리 다시 만나요.",
      description:
        "선배의 요즘, 후배의 고민, 그리고 내 이야기. 건국대 컴공 선후배와 편하게 나누는 저녁. 처음 오셔도 환영해요.",
      notice: "9월 7일 신청·환불 마감 · 처음 오는 분도, 혼자 오는 분도 환영해요",
      dateLabel: "2026년 9월 17일(목)",
      time: "19:00 시작 · 22:00 종료",
      venue: "홍대입구 인근",
      address: "",
      priceLabel: "10,000원",
      capacity: 100,
      registrationMode: "manual_transfer",
      registrationProvider: "onoffmix",
      registrationUrl: "https://www.onoffmix.com/event/349124",
      bankName: "",
      bankAccountHolder: "",
      bankAccountNumber: "",
      paymentAmount: 10000,
      refundDeadlineLabel: "2026년 9월 7일 23:59",
      locationNotice: "정확한 장소는 입금 확인 후 입력한 연락처로 안내할게요.",
      applicationLabel: "참여 신청하기",
      applicationCopy:
        "참가자 정보 입력 → 계좌이체 → 입금완료 버튼. 여기까지 하면 참여신청이 끝나요.",
      aboutIntro:
        "학교생활, 프로젝트, 취업, 회사에서 겪은 일을 편하게 나눕니다. 발표를 잘하거나 아는 사람이 많지 않아도 됩니다.",
      quote: "선후배끼리 얼굴 한 번 보고, 다음에 연락할 수 있으면 충분합니다.",
      programDescription: "퇴근하거나 수업을 마치고 오는 시간을 생각해, 늦게 도착해도 합류할 수 있게 진행합니다.",
      agenda: [
        { time: "19:00", title: "도착·이름표 받기", description: "도착하는 순서대로 이름표를 받고 간단히 식사합니다." },
        { time: "19:30", title: "모임 안내", description: "오늘 순서와 참석자를 짧게 소개합니다." },
        { time: "19:40", title: "선배 세 사람 이야기", description: "회사, 연구, 창업 현장에서 겪은 일을 듣습니다." },
        { time: "20:20", title: "주제별 대화", description: "커리어, 기술, 창업 등 관심 있는 테이블에서 이야기합니다." },
        { time: "21:30", title: "자유 대화", description: "자리를 옮겨 더 이야기하거나 먼저 귀가해도 됩니다." },
        { time: "22:00", title: "마무리", description: "다음 모임에서 듣고 싶은 주제를 받고 마칩니다." },
      ],
    },
    {
      id: "2026-Q4",
      quarter: "2026 Q4",
      sequence: "04",
      status: "upcoming",
      statusLabel: "예정",
      featured: false,
      revision: 1788511037000,
      eyebrow: "KONKUK CSE ALUMNI · QUARTER 04",
      titleLineOne: "연말 모임을",
      titleLineTwo: "준비하고 있습니다.",
      description: "Q3 모임이 끝난 뒤 받은 의견을 보고 주제와 일정을 정하겠습니다.",
      notice: "분기 1회 운영 · 알림 신청 기능은 추후 연결",
      dateLabel: "2026년 4분기 · 예시안",
      time: "19:00 입장 · 19:30 시작",
      venue: "건대입구 인근 · 추후 공개",
      address: "",
      priceLabel: "추후 공개",
      capacity: 60,
      registrationMode: "manual_transfer",
      registrationProvider: "onoffmix",
      registrationUrl: "",
      bankName: "",
      bankAccountHolder: "",
      bankAccountNumber: "",
      paymentAmount: 0,
      refundDeadlineLabel: "추후 공개",
      locationNotice: "정확한 장소는 신청이 열린 뒤 확정자에게만 안내합니다.",
      applicationLabel: "오픈 예정",
      programDescription: "일정과 순서는 Q3 모임 뒤에 정하겠습니다.",
      agenda: [
        { time: "미정", title: "올해 있었던 일", description: "올해 학교와 직장에서 겪은 일을 돌아봅니다." },
        { time: "미정", title: "테이블 대화", description: "Q3 참가자들이 많이 고른 주제로 이야기합니다." },
      ],
    },
  ],
};
