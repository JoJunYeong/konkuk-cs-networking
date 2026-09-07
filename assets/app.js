(() => {
  "use strict";

  const sourceConfig = window.NETWORKING_SITE_CONFIG;

  if (!sourceConfig || !Array.isArray(sourceConfig.events) || sourceConfig.events.length === 0) {
    document.body.innerHTML =
      '<main style="padding:40px;font-family:system-ui"><h1>설정 파일을 확인해 주세요.</h1><p>config/site.config.js의 events 배열이 비어 있습니다.</p></main>';
    return;
  }

  const clone = (value) =>
    typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));

  function eventRevision(event) {
    const revision = Number(event?.revision);
    return Number.isFinite(revision) && revision > 0 ? revision : 0;
  }

  function mergeEventCollections(staticEvents, managedEvents) {
    const managedById = new Map(managedEvents.map((event) => [event.id, event]));
    const staticIds = new Set(staticEvents.map((event) => event.id));
    const merged = staticEvents.map((staticEvent) => {
      const managedEvent = managedById.get(staticEvent.id);
      if (!managedEvent) return staticEvent;
      return eventRevision(staticEvent) > eventRevision(managedEvent)
        ? staticEvent
        : managedEvent;
    });

    return merged.concat(managedEvents.filter((event) => !staticIds.has(event.id)));
  }

  const config = clone(sourceConfig);
  const { deadlinePassed, effectiveStatus, formatDeadline } = window.KURegistrationTime;
  const { participantLabel, feesReady, participantAmount, feeSummary } = window.KURegistrationFees;
  const state = {
    event: null,
    submitting: false,
    refundSubmitting: false,
    lastRegistrationId: "",
    registrationStep: "info",
    managedHistory: null,
    displayedRegistrationStatus: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const setText = (selector, value) => {
    const element = $(selector);
    if (element) element.textContent = value ?? "";
  };

  const elements = {
    previewBanner: $("#preview-banner"),
    quarterTabs: $("#quarter-tabs"),
    timeline: $("#timeline"),
    form: $("#registration-form"),
    formStatus: $("#form-status"),
    fields: $("#dynamic-fields"),
    submit: $("#submit-button"),
    bankTransferCard: $("#bank-transfer-card"),
    infoStep: $("#registration-info-step"),
    backToInfo: $("#back-to-info"),
    receipt: $("#registration-receipt"),
    copyReceiptId: $("#copy-receipt-id"),
    copyBankAccount: $("#copy-bank-account"),
    refundRequest: $("#refund-request"),
    refundForm: $("#refund-form"),
    refundStatus: $("#refund-status"),
    primaryCta: $("#primary-cta"),
    headerCta: $("#header-cta"),
    mobileCta: $("#mobile-cta"),
    managedRegistration: $("#managed-registration"),
    providerCta: $("#provider-cta"),
    resultDialog: $("#result-dialog"),
    customizerDialog: $("#customizer-dialog"),
    customizerForm: $("#customizer-form"),
    floatingMarks: $("#floating-marks"),
    archiveList: $("#archive-list"),
    archiveCount: $("#archive-count"),
    archiveAttendance: $("#archive-attendance"),
    archiveSourceNote: $("#archive-source-note"),
    copyRegistrationId: $("#copy-registration-id"),
  };

  const providerNames = {
    onoffmix: "온오프믹스",
    eventus: "이벤터스",
    other: "외부 신청 플랫폼",
  };

  function safeExternalUrl(rawUrl) {
    if (!rawUrl) return "";

    try {
      const parsed = new URL(String(rawUrl), window.location.href);
      return parsed.protocol === "https:" ? parsed.href : "";
    } catch (_error) {
      return "";
    }
  }

  function registrationDetails(event = state.event) {
    const provider = event?.registrationProvider || config.registration.provider || "other";
    return {
      provider,
      providerName:
        event?.registrationProviderLabel ||
        providerNames[provider] ||
        config.registration.providerLabel ||
        providerNames.other,
      url: safeExternalUrl(event?.registrationUrl || config.registration.providerUrl),
    };
  }

  function registrationMode(event = state.event) {
    const mode = event?.registrationMode || config.registration.mode || "preview";
    return ["preview", "external", "manual_transfer", "api"].includes(mode)
      ? mode
      : "preview";
  }

  function bankTransferDetails(event = state.event, participantType = valueFromForm(elements.form, "participantType")) {
    return {
      bankName: String(event?.bankName || "").trim(),
      accountHolder: String(event?.bankAccountHolder || "").trim(),
      accountNumber: String(event?.bankAccountNumber || "").trim(),
      amount: participantAmount(event, participantType),
      refundDeadlineLabel: String(event?.refundDeadlineLabel || "").trim(),
    };
  }

  function bankTransferReady(event = state.event) {
    const details = bankTransferDetails(event);
    return Boolean(
      details.bankName &&
      details.accountHolder &&
      details.accountNumber &&
      feesReady(event),
    );
  }

  const markPlacements = [
    { x: "1.5%", y: "26%", size: "54px", duration: "15s", delay: "-3s" },
    { x: "86%", y: "12%", size: "48px", duration: "18s", delay: "-9s" },
    { x: "62%", y: "84%", size: "50px", duration: "17s", delay: "-6s" },
    { x: "9%", y: "88%", size: "44px", duration: "19s", delay: "-12s" },
  ];

  function localFirestoreEmulator() {
    if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return null;
    const raw = new URLSearchParams(window.location.search).get("firestoreEmulator") || "";
    return /^(localhost|127\.0\.0\.1):(\d{2,5})$/.test(raw) ? raw : null;
  }

  async function fetchManagedPayload(documentName) {
    const runtime = window.KU_ADMIN_FIREBASE;
    if (!runtime?.firebase?.projectId || !runtime?.firebase?.apiKey) return null;

    const collection = encodeURIComponent(runtime.collection || "siteData");
    const documentId = encodeURIComponent(runtime.documents?.[documentName] || documentName);
    const emulator = localFirestoreEmulator();
    const projectId = encodeURIComponent(emulator ? "demo-ku-networking" : runtime.firebase.projectId);
    const apiKey = encodeURIComponent(runtime.firebase.apiKey);
    const host = emulator ? `http://${emulator}` : "https://firestore.googleapis.com";
    const endpoint =
      `${host}/v1/projects/${projectId}` +
      `/databases/(default)/documents/${collection}/${documentId}?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(6000) : undefined });
      if (response.status === 404 || response.status === 403) return null;
      if (!response.ok) throw new Error(`managed_data_${response.status}`);
      const documentData = await response.json();
      const payload = documentData?.fields?.payload?.stringValue;
      return typeof payload === "string" ? JSON.parse(payload) : null;
    } catch (_error) {
      return null;
    }
  }

  async function loadManagedData() {
    const [managedEvents, managedHistory] = await Promise.all([
      fetchManagedPayload("events"),
      fetchManagedPayload("history"),
    ]);

    if (Array.isArray(managedEvents) && managedEvents.length > 0) {
      config.events = mergeEventCollections(config.events, managedEvents);
    }
    if (managedHistory?.events && Array.isArray(managedHistory.events)) {
      state.managedHistory = managedHistory;
    }
  }

  let firestoreClientPromise;

  async function firestoreClient() {
    const runtime = window.KU_ADMIN_FIREBASE;
    if (!runtime?.firebase?.projectId) throw new Error("firebase_configuration_missing");

    if (!firestoreClientPromise) {
      firestoreClientPromise = Promise.all([
        import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
      ]).then(([appModule, firestoreModule]) => {
        const emulator = localFirestoreEmulator();
        const firebaseConfig = emulator ? { ...runtime.firebase, projectId: "demo-ku-networking" } : runtime.firebase;
        const app = appModule.getApps().length
          ? appModule.getApp()
          : appModule.initializeApp(firebaseConfig);
        const db = firestoreModule.getFirestore(app);
        if (emulator) {
          const match = /^(localhost|127\.0\.0\.1):(\d{2,5})$/.exec(emulator);
          if (match) firestoreModule.connectFirestoreEmulator(db, match[1], Number(match[2]));
        }
        return {
          db,
          doc: firestoreModule.doc,
          serverTimestamp: firestoreModule.serverTimestamp,
          setDoc: firestoreModule.setDoc,
        };
      });
    }

    return firestoreClientPromise;
  }

  function secureRegistrationId() {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  function phoneDigits(value) {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
  }

  function formatWon(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString("ko-KR")}원` : "—";
  }

  function registrationStorageKey(eventId) {
    return `ku-cse-registration:${eventId}`;
  }

  function rememberRegistration(eventId, registrationId) {
    try {
      window.localStorage.setItem(
        registrationStorageKey(eventId),
        JSON.stringify({ registrationId, submittedAt: Date.now() }),
      );
    } catch (_error) {
      // 신청번호는 결과 화면에도 표시하므로 저장소 사용 불가가 신청을 막지는 않습니다.
    }
  }

  function rememberedRegistration(eventId) {
    try {
      const stored = JSON.parse(window.localStorage.getItem(registrationStorageKey(eventId)) || "null");
      return stored && /^[a-f0-9]{32}$/.test(stored.registrationId) ? stored : null;
    } catch (_error) {
      return null;
    }
  }

  function submittedRecently(eventId) {
    const stored = rememberedRegistration(eventId);
    return Boolean(stored && Date.now() - Number(stored.submittedAt || 0) < 60_000);
  }

  async function createManualTransferRegistration(payload, selectedEvent) {
    const participantType = payload.fields.participantType;
    const details = bankTransferDetails(selectedEvent, participantType);
    if (!participantLabel(participantType) || !details.amount) throw new Error("participant_fee_invalid");
    const digits = phoneDigits(payload.fields.phone);
    if (!/^01\d{8,9}$/.test(digits)) throw new Error("phone_invalid");

    const client = await firestoreClient();
    const registrationId = secureRegistrationId();
    const record = {
      eventId: selectedEvent.id,
      eventQuarter: String(selectedEvent.quarter || selectedEvent.id).slice(0, 40),
      status: "payment_reported",
      name: payload.fields.name.slice(0, 40),
      phone: payload.fields.phone.slice(0, 24),
      phoneDigits: digits,
      depositorName: payload.fields.depositorName.slice(0, 40),
      participantType,
      amount: details.amount,
      paymentReported: true,
      privacyConsent: true,
      consentVersion: "2026-09-07-v2",
      createdAt: client.serverTimestamp(),
      clientTimezone: String(payload.client.timezone || "").slice(0, 80),
      source: "public_web",
    };

    await client.setDoc(client.doc(client.db, "registrations", registrationId), record);
    rememberRegistration(selectedEvent.id, registrationId);
    return registrationId;
  }

  async function submitRefundRequest(event) {
    event.preventDefault();
    elements.refundStatus.textContent = "";
    elements.refundStatus.classList.remove("is-error");
    if (state.refundSubmitting || registrationMode() !== "manual_transfer") return;

    if (!elements.refundForm.reportValidity()) return;
    const data = new FormData(elements.refundForm);
    const registrationId = String(data.get("registrationId") || "").trim().toLowerCase();
    const digits = phoneDigits(data.get("phone"));
    const refundAccount = phoneDigits(data.get("refundAccount"));
    const refundBank = String(data.get("refundBank") || "").trim();
    const refundAccountHolder = String(data.get("refundAccountHolder") || "").trim();

    if (!/^[a-f0-9]{32}$/.test(registrationId)) {
      elements.refundStatus.textContent = "신청번호 32자리를 확인해 주세요.";
      elements.refundStatus.classList.add("is-error");
      return;
    }
    if (!/^01\d{8,9}$/.test(digits) || !/^\d{8,20}$/.test(refundAccount)) {
      elements.refundStatus.textContent = "휴대전화와 환불 계좌번호 형식을 확인해 주세요.";
      elements.refundStatus.classList.add("is-error");
      return;
    }

    state.refundSubmitting = true;
    const submitButton = $('button[type="submit"]', elements.refundForm);
    submitButton.disabled = true;
    submitButton.textContent = "요청을 보내는 중…";

    try {
      const client = await firestoreClient();
      await client.setDoc(client.doc(client.db, "refundRequests", registrationId), {
        registrationId,
        eventId: state.event.id,
        status: "refund_requested",
        phoneDigits: digits,
        refundBank: refundBank.slice(0, 30),
        refundAccount,
        refundAccountHolder: refundAccountHolder.slice(0, 40),
        refundConsent: true,
        createdAt: client.serverTimestamp(),
        source: "public_web",
      });
      elements.refundForm.reset();
      elements.refundStatus.textContent = "취소·환불 요청을 접수했습니다. 운영자가 입금과 환불 기준을 확인한 뒤 처리합니다.";
    } catch (_error) {
      elements.refundStatus.textContent = "요청을 접수하지 못했습니다. 신청번호·휴대전화·선택한 회차를 확인해 주세요.";
      elements.refundStatus.classList.add("is-error");
    } finally {
      state.refundSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "취소·환불 요청 보내기";
    }
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    const mapping = {
      accent: "--accent",
      accentSoft: "--accent-soft",
      ink: "--ink",
      forest: "--forest",
      paper: "--paper",
      white: "--white",
    };

    Object.entries(mapping).forEach(([key, property]) => {
      if (theme[key]) root.style.setProperty(property, theme[key]);
    });

    const themeMeta = $('meta[name="theme-color"]');
    if (themeMeta && theme.forest) themeMeta.setAttribute("content", theme.forest);
  }

  function setSiteContent() {
    const { site } = config;
    setText("#brand-name", site.brand);
    setText("#footer-brand", site.brand);
    setText("#footer-note", site.unofficialNotice);
    document.title = `${site.title} · ${site.brand}`;

    const contact = $("#contact-link");
    if (contact) {
      if (site.contactEmail && !site.contactEmail.endsWith("@example.com")) {
        contact.hidden = false;
        contact.href = `mailto:${site.contactEmail}`;
        contact.setAttribute("aria-label", `${site.contactEmail}로 운영 문의`);
      } else {
        contact.hidden = true;
      }
    }

    elements.previewBanner.hidden = !config.previewMode;
    $("#open-customizer").hidden = !config.previewMode;
  }

  function updateBanner(isOpen, routeReady) {
    if (config.previewMode) {
      elements.previewBanner.hidden = false;
      setText("#banner-title", "시험 운영 중");
      setText("#banner-copy", "아래 일정은 확정 전입니다. 입력 내용은 저장되거나 전송되지 않습니다.");
      return;
    }

    const mode = registrationMode();
    const waitingForRoute = isOpen && !routeReady && ["external", "manual_transfer"].includes(mode);
    elements.previewBanner.hidden = !waitingForRoute;
    if (waitingForRoute) {
      setText("#banner-title", "신청 준비 중");
      setText(
        "#banner-copy",
        mode === "manual_transfer"
          ? "아직 신청을 받지 않습니다. 준비가 완료되면 이 페이지에서 신청할 수 있습니다."
          : "신청·결제 링크를 연결하고 있습니다. 현재 이 페이지에서는 개인정보를 받지 않습니다.",
      );
    }
  }

  function configureCta(element, { enabled, href, label, external = false }) {
    if (!element) return;
    element.textContent = label;
    element.setAttribute("aria-disabled", String(!enabled));
    element.tabIndex = enabled ? 0 : -1;
    element.href = enabled ? href : "#apply";
    if (enabled && external) {
      element.rel = "external";
    } else {
      element.removeAttribute("rel");
    }
  }

  function renderValues() {
    const grid = $("#value-grid");
    grid.replaceChildren();

    config.values.forEach((value) => {
      const article = document.createElement("article");
      article.className = "value-card";

      const number = document.createElement("span");
      number.className = "value-card__number";
      number.textContent = value.number;

      const title = document.createElement("h3");
      title.textContent = value.title;

      const description = document.createElement("p");
      description.textContent = value.description;

      article.append(number, title, description);
      grid.append(article);
    });
  }

  function renderAudience() {
    const list = $("#audience-list");
    list.replaceChildren();

    config.audience.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    });
  }

  function formatHistoryDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return { year: "기록", day: String(value || "날짜 미상") };

    return {
      year: match[1],
      day: `${Number(match[2])}월 ${Number(match[3])}일`,
    };
  }

  function appendArchiveMeta(container, label, value) {
    if (value === undefined || value === null || value === "") return;

    const item = document.createElement("span");
    const key = document.createElement("strong");
    key.textContent = label;
    item.append(key, document.createTextNode(String(value)));
    container.append(item);
  }

  function renderHistory(history) {
    const events = Array.isArray(history?.events) ? history.events : [];
    elements.archiveList.replaceChildren();

    if (events.length === 0) {
      const empty = document.createElement("p");
      empty.className = "archive-list__error";
      empty.textContent = "공개할 수 있는 지난 모임 기록이 아직 없습니다.";
      elements.archiveList.append(empty);
      elements.archiveCount.textContent = "0회";
      elements.archiveAttendance.textContent = "0명";
      return;
    }

    const sorted = [...events].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const fragment = document.createDocumentFragment();

    sorted.forEach((event, index) => {
      const article = document.createElement("article");
      article.className = "archive-entry";

      const number = document.createElement("span");
      number.className = "archive-entry__number";
      number.textContent = `No.${String(event.sequence || index + 1).padStart(2, "0")}`;

      const date = document.createElement("div");
      date.className = "archive-entry__date";
      const formattedDate = formatHistoryDate(event.date);
      const year = document.createElement("span");
      year.textContent = formattedDate.year;
      const time = document.createElement("time");
      time.dateTime = event.date || "";
      time.textContent = formattedDate.day;
      date.append(year, time);

      const body = document.createElement("div");
      body.className = "archive-entry__body";
      const title = document.createElement("h3");
      title.textContent = event.title || `${formattedDate.year}년 네트워킹 데이`;
      const summary = document.createElement("p");
      summary.className = "archive-entry__summary";
      summary.textContent = event.summary || "날짜와 기본 정보만 공개된 기록입니다.";
      body.append(title, summary);

      const meta = document.createElement("div");
      meta.className = "archive-entry__meta";
      appendArchiveMeta(meta, "VENUE", event.venue);
      appendArchiveMeta(meta, "ATTENDANCE", Number.isFinite(Number(event.attendees)) ? `${Number(event.attendees)}명` : "");
      if (meta.childElementCount > 0) body.append(meta);

      if (Array.isArray(event.highlights) && event.highlights.length > 0) {
        const highlights = document.createElement("ul");
        highlights.className = "archive-entry__highlights";
        event.highlights.forEach((highlight) => {
          const item = document.createElement("li");
          item.textContent = highlight;
          highlights.append(item);
        });
        body.append(highlights);
      }

      if (event.learning) {
        const learning = document.createElement("p");
        learning.className = "archive-entry__learning";
        learning.textContent = `기록 메모 — ${event.learning}`;
        body.append(learning);
      }

      article.append(number, date, body);
      fragment.append(article);
    });

    elements.archiveList.append(fragment);
    const attendance = sorted.reduce((sum, event) => {
      const value = Number(event.attendees);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
    elements.archiveCount.textContent = `${sorted.length}회`;
    elements.archiveAttendance.textContent = attendance > 0 ? `${attendance}명` : "집계 전";
    if (history.sourceNote) elements.archiveSourceNote.textContent = history.sourceNote;
  }

  async function loadHistory() {
    if (state.managedHistory) {
      renderHistory(state.managedHistory);
      return;
    }

    try {
      const response = await fetch("./data/history.json", { cache: "no-store", signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(6000) : undefined });
      if (!response.ok) throw new Error(`history_${response.status}`);
      renderHistory(await response.json());
    } catch (_error) {
      elements.archiveList.replaceChildren();
      const error = document.createElement("p");
      error.className = "archive-list__error";
      error.textContent = "지난 모임 기록을 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.";
      elements.archiveList.append(error);
      elements.archiveCount.textContent = "—";
      elements.archiveAttendance.textContent = "—";
    }
  }

  function renderFloatingMarks() {
    const marks = config.decorations?.floatingMarks;
    elements.floatingMarks.replaceChildren();

    if (!marks?.enabled || !Array.isArray(marks.labels) || marks.labels.length === 0) {
      elements.floatingMarks.hidden = true;
      return;
    }

    elements.floatingMarks.hidden = false;
    elements.floatingMarks.dataset.motion = ["lively", "gentle", "still"].includes(marks.motion)
      ? marks.motion
      : "lively";

    marks.labels.slice(0, markPlacements.length).forEach((rawLabel, index) => {
      const label = String(rawLabel).trim().slice(0, 4);
      if (!label) return;

      const placement = markPlacements[index];
      const mark = document.createElement("span");
      mark.className = `floating-mark floating-mark--path-${(index % 3) + 1}`;
      mark.style.setProperty("--mark-x", placement.x);
      mark.style.setProperty("--mark-y", placement.y);
      mark.style.setProperty("--mark-size", placement.size);
      mark.style.setProperty("--mark-duration", placement.duration);
      mark.style.setProperty("--mark-delay", placement.delay);

      const face = document.createElement("span");
      face.className = "floating-mark__face";

      const eyes = document.createElement("span");
      eyes.className = "floating-mark__eyes";
      eyes.append(document.createElement("i"), document.createElement("i"));

      const glyph = document.createElement("span");
      glyph.className = "floating-mark__glyph";
      if (label.length > 2) glyph.classList.add("floating-mark__glyph--small");
      glyph.textContent = label;

      const smile = document.createElement("span");
      smile.className = "floating-mark__smile";

      face.append(eyes, glyph, smile);
      mark.append(face);
      elements.floatingMarks.append(mark);
    });
  }

  function renderFaq() {
    const list = $("#faq-list");
    list.replaceChildren();

    const faq = state.event.faq || (
      registrationMode() === "manual_transfer"
        ? config.manualTransferFaq || config.defaultFaq
        : config.defaultFaq
    );
    faq.forEach((item) => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = item.question;

      const answer = document.createElement("div");
      answer.className = "accordion__answer";
      const paragraph = document.createElement("p");
      paragraph.textContent = item.answer;
      answer.append(paragraph);

      details.append(summary, answer);
      list.append(details);
    });
  }

  function renderQuarterTabs() {
    elements.quarterTabs.replaceChildren();

    config.events.forEach((event) => {
      const button = document.createElement("button");
      button.className = "quarter-tab";
      button.type = "button";
      button.dataset.eventId = event.id;
      button.setAttribute("aria-controls", "main");
      button.setAttribute("aria-pressed", String(event.id === state.event.id));

      const label = document.createElement("span");
      label.className = "quarter-tab__label";
      const strong = document.createElement("strong");
      strong.textContent = event.quarter;
      const status = document.createElement("span");
      const mode = registrationMode(event);
      const waitingForExternalLink =
        mode === "external" &&
        event.status === "open" &&
        !registrationDetails(event).url;
      const waitingForBankAccount =
        mode === "manual_transfer" && event.status === "open" && !bankTransferReady(event);
      status.textContent = effectiveStatus(event) === "closed"
        ? "마감"
        : waitingForExternalLink
        ? "링크 준비 중"
        : waitingForBankAccount
          ? "신청 준비 중"
          : event.statusLabel;
      label.append(strong, status);

      const arrow = document.createElement("span");
      arrow.className = "quarter-tab__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      button.append(label, arrow);
      button.addEventListener("click", () => selectEvent(event.id, true));
      elements.quarterTabs.append(button);
    });
  }

  function renderTimeline() {
    elements.timeline.replaceChildren();

    state.event.agenda.forEach((item) => {
      const li = document.createElement("li");
      li.className = "timeline__item";

      const time = document.createElement("span");
      time.className = "timeline__time";
      time.textContent = item.time;

      const title = document.createElement("h3");
      title.textContent = item.title;

      const description = document.createElement("p");
      description.textContent = item.description;

      const arrow = document.createElement("span");
      arrow.className = "timeline__arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";

      li.append(time, title, description, arrow);
      elements.timeline.append(li);
    });
  }

  function updateEventContent() {
    const event = state.event;
    const displayDate = [event.dateLabel, event.time].filter(Boolean).join(" · ");
    const registration = registrationDetails(event);
    const mode = registrationMode(event);
    const usesExternalRegistration = mode === "external";
    const usesManualTransfer = mode === "manual_transfer";
    const status = effectiveStatus(event);
    state.displayedRegistrationStatus = status;
    const isOpen = status === "open";
    const hasRegistrationLink = Boolean(registration.url);
    const hasBankAccount = bankTransferReady(event);
    const routeReady = usesExternalRegistration
      ? hasRegistrationLink
      : usesManualTransfer
        ? hasBankAccount
        : true;
    const canRegister = isOpen && routeReady;
    const waitingStatus = usesManualTransfer ? "신청 준비 중" : "신청 링크 준비 중";

    setText("#event-eyebrow", event.eyebrow);
    setText(
      "#event-status",
      status === "closed" ? "마감" : isOpen && !routeReady ? waitingStatus : event.statusLabel,
    );
    $("#event-status").dataset.status = canRegister ? "open" : status === "closed" ? "closed" : "upcoming";
    setText("#hero-title-line-one", event.titleLineOne);
    setText("#hero-title-line-two", event.titleLineTwo);
    setText("#hero-description", event.description);
    setText("#hero-notice", event.notice);
    $("#hero-notice").hidden = !String(event.notice || "").trim();
    setText("#registration-deadline", `접수 마감 · ${formatDeadline(event.registrationDeadline)} (한국 시간)`);
    $("#registration-deadline").hidden = !event.registrationDeadline;
    setText("#ticket-quarter", event.quarter);
    setText("#ticket-number", event.sequence);
    setText("#ticket-date", event.dateLabel);
    setText("#ticket-time", event.time);
    setText("#ticket-venue", event.venue);
    const price = usesManualTransfer ? feeSummary(event) || event.priceLabel : event.priceLabel;
    setText("#ticket-price", price);
    setText("#ticket-capacity", `정원 ${event.capacity}명`);
    setText("#about-intro", event.aboutIntro || event.description);
    setText("#program-description", event.programDescription || "회차별 프로그램을 확인해 주세요.");
    setText("#event-quote", event.quote || "자세한 내용은 해당 회차의 일정을 확인해 주세요.");
    setText(
      "#apply-copy",
      usesManualTransfer
        ? event.applicationCopy || "신청자 정보를 입력하고 참가비를 입금한 뒤, 입금완료 버튼을 눌러주세요."
        : event.applicationCopy || event.description,
    );
    setText("#summary-event", `${event.quarter} 네트워킹 데이`);
    setText("#summary-date", displayDate);
    setText("#summary-venue", event.venue);
    setText("#summary-price", price);
    setText("#summary-registration-deadline", formatDeadline(event.registrationDeadline));
    setText(
      "#location-note",
      event.locationNotice || "정확한 장소는 신청·결제 완료자에게 운영자가 별도로 안내합니다.",
    );

    const unavailableLabel = status === "closed"
      ? "신청 마감"
      : isOpen
        ? waitingStatus
        : "오픈 예정";
    const readyLabel = usesManualTransfer
      ? "참여 신청하기"
      : event.applicationLabel === "참가 신청하기"
        ? "신청·결제하기"
        : event.applicationLabel || "신청·결제하기";
    const destination = usesExternalRegistration ? registration.url : "#apply";
    configureCta(elements.primaryCta, {
      enabled: canRegister,
      href: destination,
      label: canRegister ? readyLabel : unavailableLabel,
      external: usesExternalRegistration,
    });
    configureCta(elements.mobileCta, {
      enabled: canRegister,
      href: destination,
      label: canRegister ? (usesManualTransfer ? "참여 신청하기" : "신청·결제하기 ↗") : unavailableLabel,
      external: usesExternalRegistration,
    });
    configureCta(elements.headerCta, {
      enabled: canRegister,
      href: destination,
      label: canRegister ? (usesManualTransfer ? "참여 신청" : "신청·결제 ↗") : unavailableLabel,
      external: usesExternalRegistration,
    });

    if (usesExternalRegistration) {
      const providerHeading = canRegister
        ? "지금 신청과 결제를 한 번에 완료하세요."
        : status === "closed"
          ? "이번 회차 신청이 마감되었습니다."
          : isOpen
            ? "신청 페이지를 준비하고 있습니다."
            : "신청 오픈 전입니다.";
      setText("#provider-name", registration.providerName);
      setText("#provider-heading", providerHeading);
      setText("#provider-status", canRegister ? "신청 가능" : unavailableLabel);
      setText(
        "#provider-footnote",
        canRegister
          ? `${registration.providerName} 페이지로 이동합니다. 결제 전에 일정과 환불 기준을 꼭 확인해 주세요.`
          : "일정·참가비·환불 기준을 확정한 뒤 신청 링크가 열립니다.",
      );
      configureCta(elements.providerCta, {
        enabled: canRegister,
        href: destination,
        label: canRegister ? `${registration.providerName}에서 신청·결제하기 ↗` : unavailableLabel,
        external: true,
      });
    }

    const providerOwnsForm = usesExternalRegistration && config.registration.providerHandlesForm;
    elements.form.hidden = providerOwnsForm;
    elements.managedRegistration.hidden = !providerOwnsForm;
    elements.bankTransferCard.hidden = true;
    elements.refundRequest.hidden = !usesManualTransfer || event.status === "upcoming";

    if (usesManualTransfer) {
      const bank = bankTransferDetails(event);
      setText("#bank-name", bank.bankName || "연결 준비 중");
      setText("#bank-account-number", bank.accountNumber || "연결 준비 중");
      setText("#bank-account-holder", bank.accountHolder || "연결 준비 중");
      updateParticipantFee();
      setText(
        "#refund-deadline-copy",
        bank.refundDeadlineLabel
          ? `환불 요청 마감: ${bank.refundDeadlineLabel}. 이후에는 환불이 제한될 수 있습니다.`
          : "환불 마감과 처리 기준을 확인해 주세요.",
      );
      elements.copyBankAccount.disabled = !bank.accountNumber;
      setText("#flow-payment-title", "참가비 입금");
      setText("#flow-notice-title", "입금완료 버튼");
      setText("#flow-payment-copy", "안내된 계좌로 직접 송금");
      setText("#flow-notice-copy", "입금 내역은 운영자가 확인합니다.");
      setText("#transfer-registration-deadline", event.registrationDeadline ? `접수 마감: ${formatDeadline(event.registrationDeadline)} (한국 시간)` : "");
      $("#transfer-registration-deadline").hidden = !event.registrationDeadline;
      setText("#transfer-refund-policy", bank.refundDeadlineLabel ? `환불 요청 마감: ${bank.refundDeadlineLabel}` : "환불 기준을 확인한 뒤 입금해 주세요.");
    } else {
      setText("#flow-payment-title", "신청·결제");
      setText("#flow-notice-title", "참여 확정 안내");
      setText("#flow-payment-copy", "외부 신청 페이지에서 진행");
      setText("#flow-notice-copy", "확정자에게 별도 공지");
    }

    setText(
      "#form-footnote",
      mode === "preview"
        ? "현재 미리보기 모드입니다. 입력 내용은 저장되거나 전송되지 않습니다."
        : usesExternalRegistration
          ? "신청과 결제는 연결된 외부 제공자의 페이지에서 완료됩니다."
          : usesManualTransfer
            ? "입금 후 마지막 버튼까지 눌러야 신청이 접수됩니다."
            : "결제 승인 전에는 참여가 확정되지 않습니다.",
    );

    const remembered = usesManualTransfer ? rememberedRegistration(event.id) : null;
    if (remembered && !elements.refundForm.elements.registrationId.value) {
      elements.refundForm.elements.registrationId.value = remembered.registrationId;
    }

    setFormAvailability(canRegister);
    setRegistrationStep("info");
    renderReceipt();
    updateBanner(isOpen, routeReady);
    renderTimeline();
    renderFaq();
    renderQuarterTabs();
  }

  function setFormAvailability(canRegister) {
    const controls = $$("input, select, textarea", elements.form);
    controls.forEach((control) => {
      control.disabled = !canRegister;
    });
    elements.submit.disabled = !canRegister;
    elements.submit.textContent = canRegister
      ? submitLabelForMode()
      : effectiveStatus(state.event) === "closed"
        ? "신청이 마감되었습니다"
        : state.event.status === "open"
          ? registrationMode() === "manual_transfer"
            ? "입금 계좌 준비 중입니다"
            : "신청 연결 준비 중입니다"
          : "신청 오픈 전입니다";
  }

  function submitLabelForMode() {
    const mode = registrationMode();
    if (mode === "external") return "외부 결제 페이지로 이동";
    if (mode === "manual_transfer") return state.registrationStep === "payment" ? "입금완료 · 참여신청 마무리" : "입금 안내 확인하기 →";
    if (mode === "api") return "신청 후 결제하기";
    return "신청 내용 확인하기";
  }

  function refreshDeadline() {
    if (!state.event || state.submitting || effectiveStatus(state.event) === state.displayedRegistrationStatus) return;
    updateEventContent();
    if (deadlinePassed(state.event) && !rememberedRegistration(state.event.id)) {
      showStatus("접수가 마감되었습니다. 이미 입금했다면 운영자에게 문의해 주세요.");
    }
  }

  function setRegistrationStep(step, focus = false) {
    const manual = registrationMode() === "manual_transfer";
    const payment = manual && step === "payment";
    state.registrationStep = payment ? "payment" : "info";
    elements.infoStep.hidden = payment;
    elements.bankTransferCard.hidden = !payment;
    elements.backToInfo.hidden = !payment;
    $(".form-progress").hidden = !manual;
    ["info", "payment"].forEach(name => {
      const item = $(`#progress-${name}`);
      if (name === state.registrationStep) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    if (payment) {
      const data = formPayload();
      updateParticipantFee();
      setText("#transfer-review", `${data.fields.name} · ${data.fields.phone}`);
      setText("#bank-depositor-name", data.fields.depositorName);
    }
    if (!elements.submit.disabled) elements.submit.textContent = submitLabelForMode();
    if (focus) $(payment ? "#bank-transfer-title" : "#info-step-title").focus();
  }

  function renderReceipt(registrationId = "") {
    const manual = registrationMode() === "manual_transfer";
    const saved = manual ? rememberedRegistration(state.event.id) : null;
    const id = registrationId || saved?.registrationId || "";
    elements.receipt.hidden = !id;
    if (id) {
      setText("#receipt-registration-id", id);
      state.lastRegistrationId = id;
      elements.form.hidden = true;
    }
  }

  function selectEvent(eventId, updateUrl = false) {
    if (state.submitting) return;
    const selected = config.events.find((event) => event.id === eventId);
    if (!selected) return;

    state.event = selected;
    hideStatus();
    elements.form.reset();
    elements.refundForm.reset();
    elements.refundStatus.textContent = "";
    elements.refundStatus.classList.remove("is-error");
    clearFieldErrors();
    updateEventContent();

    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("quarter", selected.id);
      window.history.replaceState({}, "", url);
    }
  }

  function createField(field) {
    const wrapper = document.createElement("label");
    wrapper.className = `field field--${field.width || "full"}`;

    const label = document.createElement("span");
    label.className = "field__label";
    label.textContent = field.label;
    if (field.required) {
      const required = document.createElement("em");
      required.textContent = " *";
      label.append(required);
    }

    let control;
    if (field.type === "select") {
      control = document.createElement("select");
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "선택해 주세요";
      placeholder.disabled = true;
      placeholder.defaultSelected = true;
      placeholder.selected = true;
      control.append(placeholder);
      field.options.forEach((item) => {
        const option = document.createElement("option");
        option.value = typeof item === "string" ? item : item.value;
        option.textContent = typeof item === "string" ? item : item.label;
        control.append(option);
      });
    } else if (field.type === "textarea") {
      control = document.createElement("textarea");
    } else {
      control = document.createElement("input");
      control.type = field.type;
    }

    control.name = field.name;
    control.id = `field-${field.name}`;
    control.required = Boolean(field.required);
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.autocomplete) control.autocomplete = field.autocomplete;
    if (field.pattern) control.pattern = field.pattern;
    if (field.maxLength) control.maxLength = field.maxLength;
    control.setAttribute("aria-describedby", `error-${field.name}`);

    const error = document.createElement("span");
    error.className = "field__error";
    error.id = `error-${field.name}`;
    error.setAttribute("aria-live", "polite");

    wrapper.append(label, control);
    if (field.name === "participantType") {
      const fee = document.createElement("small");
      fee.id = "participant-fee";
      fee.setAttribute("aria-live", "polite");
      control.setAttribute("aria-describedby", `participant-fee error-${field.name}`);
      control.addEventListener("change", updateParticipantFee);
      wrapper.append(fee);
    }

    if (field.maxLength && field.type === "textarea") {
      const counter = document.createElement("span");
      counter.className = "field__count";
      counter.textContent = `0/${field.maxLength}`;
      control.addEventListener("input", () => {
        counter.textContent = `${control.value.length}/${field.maxLength}`;
      });
      wrapper.append(counter);
    }

    control.addEventListener("blur", () => validateControl(control, error));
    control.addEventListener("input", () => {
      if (control.getAttribute("aria-invalid") === "true") validateControl(control, error);
    });

    wrapper.append(error);
    return wrapper;
  }

  function renderFields() {
    elements.fields.replaceChildren();
    config.form.fields.forEach((field) => elements.fields.append(createField(field)));
    setText("#privacy-summary", config.form.privacySummary);
  }

  function updateParticipantFee() {
    const type = valueFromForm(elements.form, "participantType");
    const amount = participantAmount(state.event, type);
    setText("#participant-fee", amount ? `${participantLabel(type)} 참가비 ${formatWon(amount)}` : "참가 구분을 선택해 주세요.");
    setText("#bank-transfer-amount", amount ? formatWon(amount) : "참가 구분을 선택해 주세요");
    setText("#bank-participant-type", participantLabel(type) || "—");
  }

  function validationMessage(control) {
    if (control.validity.valueMissing || (control.required && !control.value.trim())) return "필수 항목을 입력해 주세요.";
    if (control.validity.typeMismatch) return "형식에 맞게 입력해 주세요.";
    if (control.validity.patternMismatch) return "전화번호 형식을 확인해 주세요.";
    if (control.validity.tooLong) return `최대 ${control.maxLength}자까지 입력할 수 있습니다.`;
    return "입력 내용을 확인해 주세요.";
  }

  function validateControl(control, errorElement) {
    const isValid = control.checkValidity() && (!control.required || Boolean(control.value.trim()));
    control.setAttribute("aria-invalid", String(!isValid));
    errorElement.textContent = isValid ? "" : validationMessage(control);
    return isValid;
  }

  function clearFieldErrors() {
    $$("[aria-invalid]", elements.form).forEach((control) => control.removeAttribute("aria-invalid"));
    $$(".field__error", elements.form).forEach((error) => {
      error.textContent = "";
    });
  }

  function validateForm() {
    let valid = true;
    $$("input, select, textarea", elements.fields).forEach((control) => {
      const error = $(`#error-${control.name}`);
      if (!validateControl(control, error)) valid = false;
    });

    const phone = elements.form.elements.phone;
    if (registrationMode() === "manual_transfer" && !/^01\d{8,9}$/.test(phoneDigits(phone.value))) {
      valid = false;
      phone.setAttribute("aria-invalid", "true");
      setText("#error-phone", "010으로 시작하는 휴대전화 번호를 확인해 주세요.");
    }
    const privacy = $('input[name="privacyConsent"]', elements.form);
    if (!privacy.checked) {
      valid = false;
      showStatus("개인정보 수집·이용 필수 동의를 확인해 주세요.");
    }

    if (!valid) {
      if (state.registrationStep === "payment") setRegistrationStep("info");
      const firstInvalid = $('[aria-invalid="true"]', elements.form) || privacy;
      firstInvalid.focus();
    }

    return valid;
  }

  function formPayload() {
    const data = new FormData(elements.form);
    const fields = {};
    config.form.fields.forEach((field) => {
      fields[field.name] = String(data.get(field.name) || "").trim();
    });

    return {
      eventId: state.event.id,
      fields,
      consents: {
        privacy: data.get("privacyConsent") === "on",
        paymentReported: registrationMode() === "manual_transfer" && state.registrationStep === "payment",
      },
      client: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideStatus();

    if (state.submitting) return;
    if (effectiveStatus(state.event) !== "open") {
      updateEventContent();
      showStatus(effectiveStatus(state.event) === "closed" ? "접수가 마감되었습니다. 이미 입금했다면 운영자에게 문의해 주세요." : "아직 신청을 받지 않습니다.");
      return;
    }
    const mode = registrationMode();

    if (mode === "external" && config.registration.providerHandlesForm) {
      const registrationUrl = registrationDetails().url;
      if (!registrationUrl) {
        showStatus("외부 결제 URL이 아직 설정되지 않았습니다.");
        return;
      }
      window.location.assign(registrationUrl);
      return;
    }

    if (!validateForm()) return;
    if (mode === "manual_transfer" && state.registrationStep === "info") {
      if (!bankTransferReady()) {
        showStatus("아직 신청을 받지 않습니다. 잠시 후 다시 확인해 주세요.");
        return;
      }
      setRegistrationStep("payment", true);
      return;
    }
    const payload = formPayload();

    if (valueFromForm(elements.form, "company")) {
      showStatus("신청을 처리하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      return;
    }

    if (mode === "preview") {
      showPreviewResult(payload);
      return;
    }

    if (mode === "external") {
      const registrationUrl = registrationDetails().url;
      if (!registrationUrl) {
        showStatus("외부 결제 URL이 아직 설정되지 않았습니다.");
        return;
      }
      window.location.assign(registrationUrl);
      return;
    }

    if (mode === "manual_transfer") {
      if (!bankTransferReady()) {
        showStatus("입금 계좌 설정이 아직 완료되지 않아 신청을 받지 않습니다.");
        return;
      }

      const remembered = rememberedRegistration(state.event.id);
      if (submittedRecently(state.event.id) && remembered) {
        showStatus(`이 브라우저에서 방금 접수한 신청이 있습니다. 신청번호 ${remembered.registrationId}를 확인해 주세요.`);
        return;
      }

      const selectedEvent = clone(state.event);
      state.submitting = true;
      elements.form.setAttribute("aria-busy", "true");
      $$("input, select, textarea, button", elements.form).forEach(control => { control.disabled = true; });
      $$("button", elements.quarterTabs).forEach(control => { control.disabled = true; });
      elements.submit.textContent = "신청 중…";

      try {
        const registrationId = await createManualTransferRegistration(payload, selectedEvent);
        elements.form.reset();
        showManualTransferResult(payload, registrationId);
        renderReceipt(registrationId);
      } catch (_error) {
        showStatus(deadlinePassed(selectedEvent)
          ? "접수 시간이 지나 신청하지 못했습니다. 이미 입금했다면 운영자에게 문의해 주세요."
          : "신청 완료를 확인하지 못했습니다. 입력한 내용은 유지됩니다. 다시 입금하지 말고 연결 상태를 확인한 뒤 재시도해 주세요.");
      } finally {
        state.submitting = false;
        elements.form.removeAttribute("aria-busy");
        $$("input, select, textarea, button", elements.form).forEach(control => { control.disabled = false; });
        $$("button", elements.quarterTabs).forEach(control => { control.disabled = false; });
        if (effectiveStatus(state.event) !== "open") updateEventContent();
        else elements.submit.textContent = submitLabelForMode();
      }
      return;
    }

    if (mode !== "api" || !config.registration.endpoint) {
      showStatus("신청 API 설정을 확인해 주세요. 현재 요청은 전송되지 않았습니다.");
      return;
    }

    state.submitting = true;
    elements.submit.disabled = true;
    elements.submit.textContent = "연결 중…";

    try {
      const response = await fetch(config.registration.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`registration_failed_${response.status}`);
      const result = await response.json();
      if (!result.checkoutUrl) throw new Error("checkout_url_missing");
      window.location.assign(result.checkoutUrl);
    } catch (_error) {
      showStatus("신청 연결에 실패했습니다. 입력 내용은 저장되었다고 간주하지 말고 다시 시도해 주세요.");
      state.submitting = false;
      elements.submit.disabled = false;
      elements.submit.textContent = submitLabelForMode();
    }
  }

  function valueFromForm(form, name) {
    return String(form.elements[name]?.value || "").trim();
  }

  function renderResultRows(rows) {
    const summary = $("#result-summary");
    summary.replaceChildren();

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const key = document.createElement("span");
      const data = document.createElement("strong");
      key.textContent = label;
      data.textContent = value;
      row.append(key, data);
      summary.append(row);
    });
  }

  function showManualTransferResult(payload, registrationId) {
    state.lastRegistrationId = registrationId;
    setText("#result-eyebrow", "신청 접수");
    setText("#result-title", "신청이 접수되었습니다.");
    setText(
      "#result-copy",
      "입금 확인 후 입력한 연락처로 참여 확정과 장소를 안내합니다. 취소·환불 요청에 필요한 신청번호를 보관해 주세요.",
    );
    renderResultRows([
      ["회차", state.event.quarter],
      ["신청자", payload.fields.name || "—"],
      ["참가 구분", participantLabel(payload.fields.participantType)],
      ["참가비", formatWon(participantAmount(state.event, payload.fields.participantType))],
      ["입금자명", payload.fields.depositorName || "—"],
      ["현재 상태", "신청 접수 완료 · 입금 확인 중"],
      ["신청번호", registrationId],
    ]);
    elements.copyRegistrationId.hidden = false;
    elements.copyRegistrationId.textContent = "신청번호 복사";
    if (!elements.refundForm.elements.registrationId.value) {
      elements.refundForm.elements.registrationId.value = registrationId;
    }
    openDialog(elements.resultDialog);
  }

  function showPreviewResult(payload) {
    state.lastRegistrationId = "";
    setText("#result-eyebrow", "PREVIEW CHECK");
    setText("#result-title", "입력한 내용을 확인했습니다.");
    setText("#result-copy", "지금은 시험 운영 중이라 신청 내용은 저장되지 않았고, 결제와 메시지도 보내지 않았습니다.");
    elements.copyRegistrationId.hidden = true;
    renderResultRows([
      ["회차", state.event.quarter],
      ["신청자", payload.fields.name || "입력 확인"],
      ["화면 상태", "폼 검증 완료"],
      ["실제 처리", "저장·결제·메시지 없음"],
    ]);

    openDialog(elements.resultDialog);
  }

  function showStatus(message) {
    elements.formStatus.textContent = message;
    elements.formStatus.classList.add("is-visible");
  }

  function hideStatus() {
    elements.formStatus.textContent = "";
    elements.formStatus.classList.remove("is-visible");
  }

  async function sharePage(button) {
    const shareData = {
      title: config.site.title,
      text: config.site.shareText,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      const original = button.textContent;
      button.textContent = "링크를 복사했습니다";
      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    } catch (error) {
      if (error?.name !== "AbortError") window.prompt("아래 링크를 복사해 주세요.", window.location.href);
    }
  }

  async function copyText(button, text, successLabel) {
    if (!text) return;
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = successLabel;
      window.setTimeout(() => {
        button.textContent = original;
      }, 1800);
    } catch (_error) {
      window.prompt("아래 내용을 복사해 주세요.", text);
    }
  }

  function openDialog(dialog) {
    document.body.classList.add("modal-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    document.body.classList.remove("modal-open");
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function initializeDialogs() {
    $$('[data-close-dialog]').forEach((button) => {
      button.addEventListener("click", () => closeDialog(elements.resultDialog));
    });
    $$('[data-close-customizer]').forEach((button) => {
      button.addEventListener("click", () => closeDialog(elements.customizerDialog));
    });

    [elements.resultDialog, elements.customizerDialog].forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
      dialog.addEventListener("close", () => document.body.classList.remove("modal-open"));
    });
  }

  function openCustomizer() {
    if (!config.previewMode) return;
    const form = elements.customizerForm;
    form.elements.title.value = `${state.event.titleLineOne} ${state.event.titleLineTwo}`;
    form.elements.dateLabel.value = state.event.dateLabel;
    form.elements.time.value = state.event.time;
    form.elements.venue.value = state.event.venue;
    form.elements.priceLabel.value = state.event.priceLabel;
    form.elements.capacity.value = state.event.capacity;
    form.elements.accent.value = toHex(config.theme.accent, "#7b2638");
    form.elements.paper.value = toHex(config.theme.paper, "#f2eee2");
    form.elements.markLabels.value = (config.decorations?.floatingMarks?.labels || []).join(", ");
    form.elements.markMotion.value = config.decorations?.floatingMarks?.motion || "lively";
    setText("#customizer-message", "변경 내용은 현재 브라우저 미리보기에만 적용됩니다.");
    openDialog(elements.customizerDialog);
  }

  function toHex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function applyCustomizer(event) {
    event.preventDefault();
    const data = new FormData(elements.customizerForm);
    const title = String(data.get("title") || "").trim();
    const parts = title.split(/,\s*/);

    if (parts.length > 1) {
      state.event.titleLineOne = `${parts.shift()},`;
      state.event.titleLineTwo = parts.join(", ");
    } else {
      state.event.titleLineOne = title;
      state.event.titleLineTwo = "";
    }

    state.event.dateLabel = String(data.get("dateLabel") || "").trim();
    state.event.time = String(data.get("time") || "").trim();
    state.event.venue = String(data.get("venue") || "").trim();
    state.event.priceLabel = String(data.get("priceLabel") || "").trim();
    state.event.capacity = Math.max(1, Number(data.get("capacity")) || 1);
    config.theme.accent = String(data.get("accent") || config.theme.accent);
    config.theme.paper = String(data.get("paper") || config.theme.paper);
    const markLabels = String(data.get("markLabels") || "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .slice(0, markPlacements.length);
    config.decorations ??= {};
    config.decorations.floatingMarks ??= {};
    config.decorations.floatingMarks.enabled = markLabels.length > 0;
    config.decorations.floatingMarks.labels = markLabels;
    config.decorations.floatingMarks.motion = ["lively", "gentle", "still"].includes(
      String(data.get("markMotion")),
    )
      ? String(data.get("markMotion"))
      : "lively";

    applyTheme(config.theme);
    renderFloatingMarks();
    updateEventContent();
    setText("#customizer-message", "미리보기에 적용했습니다. JSON을 복사해 설정 파일에 반영할 수 있습니다.");
  }

  async function copyCurrentConfig() {
    const exportData = {
      theme: {
        accent: config.theme.accent,
        paper: config.theme.paper,
      },
      decorations: config.decorations,
      event: state.event,
    };
    const serialized = JSON.stringify(exportData, null, 2);

    try {
      await navigator.clipboard.writeText(serialized);
      setText("#customizer-message", "현재 설정 JSON을 클립보드에 복사했습니다.");
    } catch (_error) {
      window.prompt("아래 설정을 복사해 주세요.", serialized);
    }
  }

  function initializeEvents() {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        document.body.classList.toggle("applying", entries[0].isIntersecting);
      }, { threshold: 0 }).observe($("#apply"));
    }
    elements.form.addEventListener("submit", handleSubmit);
    elements.backToInfo.addEventListener("click", () => {
      if (state.submitting) return;
      hideStatus();
      setRegistrationStep("info", true);
    });
    elements.copyReceiptId.addEventListener("click", () => {
      copyText(elements.copyReceiptId, state.lastRegistrationId, "신청번호 복사 완료");
    });
    $("#new-registration").addEventListener("click", () => {
      try { window.localStorage.removeItem(registrationStorageKey(state.event.id)); } catch (_error) {}
      state.lastRegistrationId = "";
      selectEvent(state.event.id);
      $("#info-step-title").focus();
    });
    elements.refundForm.addEventListener("submit", submitRefundRequest);
    elements.copyBankAccount.addEventListener("click", () => {
      copyText(elements.copyBankAccount, bankTransferDetails().accountNumber.replace(/\D/g, ""), "계좌번호 복사 완료");
    });
    elements.copyRegistrationId.addEventListener("click", () => {
      copyText(elements.copyRegistrationId, state.lastRegistrationId, "신청번호를 복사했습니다");
    });
    $("#share-button").addEventListener("click", (event) => sharePage(event.currentTarget));
    $("#footer-share").addEventListener("click", (event) => sharePage(event.currentTarget));
    $("#open-customizer").addEventListener("click", openCustomizer);
    elements.customizerForm.addEventListener("submit", applyCustomizer);
    $("#copy-config").addEventListener("click", copyCurrentConfig);

    [elements.primaryCta, elements.headerCta, elements.mobileCta, elements.providerCta].forEach((cta) => {
      cta.addEventListener("click", (event) => {
        if (cta.getAttribute("aria-disabled") === "true" || effectiveStatus(state.event) !== "open") {
          event.preventDefault();
          refreshDeadline();
        }
      });
    });
  }

  function initialEventId() {
    const requested = new URLSearchParams(window.location.search).get("quarter");
    if (requested && config.events.some((event) => event.id === requested)) return requested;
    return config.events.find((event) => event.featured)?.id || config.events[0].id;
  }

  async function initialize() {
    await loadManagedData();
    applyTheme(config.theme);
    setSiteContent();
    renderValues();
    renderAudience();
    loadHistory();
    renderFloatingMarks();
    renderFields();
    initializeDialogs();
    initializeEvents();
    selectEvent(initialEventId());
    window.setInterval(refreshDeadline, 1000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDeadline(); });
  }

  initialize().catch(() => {
    document.body.innerHTML =
      '<main style="padding:40px;font-family:system-ui"><h1>페이지를 불러오지 못했습니다.</h1><p>잠시 뒤 다시 시도해 주세요.</p></main>';
  });
})();
