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

  const config = clone(sourceConfig);
  const state = {
    event: null,
    submitting: false,
    managedHistory: null,
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
    primaryCta: $("#primary-cta"),
    mobileCta: $("#mobile-cta"),
    resultDialog: $("#result-dialog"),
    customizerDialog: $("#customizer-dialog"),
    customizerForm: $("#customizer-form"),
    floatingMarks: $("#floating-marks"),
    archiveList: $("#archive-list"),
    archiveCount: $("#archive-count"),
    archiveAttendance: $("#archive-attendance"),
    archiveSourceNote: $("#archive-source-note"),
  };

  const markPlacements = [
    { x: "1.5%", y: "26%", size: "54px", duration: "15s", delay: "-3s" },
    { x: "86%", y: "12%", size: "48px", duration: "18s", delay: "-9s" },
    { x: "62%", y: "84%", size: "50px", duration: "17s", delay: "-6s" },
    { x: "9%", y: "88%", size: "44px", duration: "19s", delay: "-12s" },
  ];

  async function fetchManagedPayload(documentName) {
    const runtime = window.KU_ADMIN_FIREBASE;
    if (!runtime?.firebase?.projectId || !runtime?.firebase?.apiKey) return null;

    const collection = encodeURIComponent(runtime.collection || "siteData");
    const documentId = encodeURIComponent(runtime.documents?.[documentName] || documentName);
    const projectId = encodeURIComponent(runtime.firebase.projectId);
    const apiKey = encodeURIComponent(runtime.firebase.apiKey);
    const endpoint =
      `https://firestore.googleapis.com/v1/projects/${projectId}` +
      `/databases/(default)/documents/${collection}/${documentId}?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
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
      config.events = managedEvents;
    }
    if (managedHistory?.events && Array.isArray(managedHistory.events)) {
      state.managedHistory = managedHistory;
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
      contact.href = `mailto:${site.contactEmail}`;
      contact.setAttribute("aria-label", `${site.contactEmail}로 운영 문의`);
    }

    elements.previewBanner.hidden = !config.previewMode;
    $("#open-customizer").hidden = !config.previewMode;
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
      const response = await fetch("./data/history.json", { cache: "no-store" });
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

    const faq = state.event.faq || config.defaultFaq;
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
      status.textContent = event.statusLabel;
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

    setText("#event-eyebrow", event.eyebrow);
    setText("#event-status", event.statusLabel);
    $("#event-status").dataset.status = event.status;
    setText("#hero-title-line-one", event.titleLineOne);
    setText("#hero-title-line-two", event.titleLineTwo);
    setText("#hero-description", event.description);
    setText("#hero-notice", event.notice);
    setText("#ticket-quarter", event.quarter);
    setText("#ticket-number", event.sequence);
    setText("#ticket-date", event.dateLabel);
    setText("#ticket-time", event.time);
    setText("#ticket-venue", event.venue);
    setText("#ticket-price", event.priceLabel);
    setText("#ticket-capacity", `정원 ${event.capacity}명`);
    setText("#about-intro", event.aboutIntro || event.description);
    setText("#program-description", event.programDescription || "회차별 프로그램을 확인해 주세요.");
    setText("#event-quote", event.quote || "분기마다 새로운 연결이 시작됩니다.");
    setText("#apply-copy", event.applicationCopy || event.description);
    setText("#summary-event", `${event.quarter} 네트워킹 데이`);
    setText("#summary-date", displayDate);
    setText("#summary-venue", [event.venue, event.address].filter(Boolean).join(" · "));
    setText("#summary-price", event.priceLabel);

    const isOpen = event.status === "open";
    const ctaLabel = isOpen ? event.applicationLabel : event.status === "closed" ? "신청 마감" : "오픈 예정";
    [elements.primaryCta, elements.mobileCta].forEach((cta) => {
      cta.textContent = ctaLabel;
      cta.setAttribute("aria-disabled", String(!isOpen));
      cta.tabIndex = isOpen ? 0 : -1;
    });

    setFormAvailability(isOpen);
    renderTimeline();
    renderFaq();
    renderQuarterTabs();
  }

  function setFormAvailability(isOpen) {
    const controls = $$("input, select, textarea", elements.form);
    controls.forEach((control) => {
      control.disabled = !isOpen;
    });
    elements.submit.disabled = !isOpen;
    elements.submit.textContent = isOpen
      ? submitLabelForMode()
      : state.event.status === "closed"
        ? "신청이 마감되었습니다"
        : "신청 오픈 전입니다";
  }

  function submitLabelForMode() {
    if (config.registration.mode === "external") return "외부 결제 페이지로 이동";
    if (config.registration.mode === "api") return "신청 후 결제하기";
    return "신청 내용 확인하기";
  }

  function selectEvent(eventId, updateUrl = false) {
    const selected = config.events.find((event) => event.id === eventId);
    if (!selected) return;

    state.event = selected;
    hideStatus();
    elements.form.reset();
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
      field.options.forEach((optionLabel) => {
        const option = document.createElement("option");
        option.value = optionLabel;
        option.textContent = optionLabel;
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

    if (field.maxLength) {
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

  function validationMessage(control) {
    if (control.validity.valueMissing) return "필수 항목을 입력해 주세요.";
    if (control.validity.typeMismatch) return "형식에 맞게 입력해 주세요.";
    if (control.validity.patternMismatch) return "전화번호 형식을 확인해 주세요.";
    if (control.validity.tooLong) return `최대 ${control.maxLength}자까지 입력할 수 있습니다.`;
    return "입력 내용을 확인해 주세요.";
  }

  function validateControl(control, errorElement) {
    const isValid = control.checkValidity();
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

    const privacy = $('input[name="privacyConsent"]', elements.form);
    if (!privacy.checked) {
      valid = false;
      showStatus("개인정보 수집·이용 필수 동의를 확인해 주세요.");
    }

    if (!valid) {
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
        networkingProfile: data.get("networkingConsent") === "on",
      },
      client: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    hideStatus();

    if (state.event.status !== "open" || state.submitting) return;
    const mode = config.registration.mode;

    if (mode === "external" && config.registration.providerHandlesForm) {
      if (!config.registration.providerUrl) {
        showStatus("외부 결제 URL이 아직 설정되지 않았습니다.");
        return;
      }
      window.location.assign(config.registration.providerUrl);
      return;
    }

    if (!validateForm()) return;
    const payload = formPayload();

    if (mode === "preview") {
      showPreviewResult(payload);
      return;
    }

    if (mode === "external") {
      if (!config.registration.providerUrl) {
        showStatus("외부 결제 URL이 아직 설정되지 않았습니다.");
        return;
      }
      window.location.assign(config.registration.providerUrl);
      return;
    }

    if (mode !== "api" || !config.registration.endpoint) {
      showStatus("신청 API 설정을 확인해 주세요. 현재 요청은 전송되지 않았습니다.");
      return;
    }

    state.submitting = true;
    elements.submit.disabled = true;
    elements.submit.textContent = "안전하게 연결하는 중…";

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

  function showPreviewResult(payload) {
    const summary = $("#result-summary");
    summary.replaceChildren();

    const rows = [
      ["회차", state.event.quarter],
      ["신청자", payload.fields.name || "입력 확인"],
      ["화면 상태", "폼 검증 완료"],
      ["실제 처리", "저장·결제·메시지 없음"],
    ];

    rows.forEach(([label, value]) => {
      const row = document.createElement("div");
      const key = document.createElement("span");
      const data = document.createElement("strong");
      key.textContent = label;
      data.textContent = value;
      row.append(key, data);
      summary.append(row);
    });

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
    elements.form.addEventListener("submit", handleSubmit);
    $("#share-button").addEventListener("click", (event) => sharePage(event.currentTarget));
    $("#footer-share").addEventListener("click", (event) => sharePage(event.currentTarget));
    $("#open-customizer").addEventListener("click", openCustomizer);
    elements.customizerForm.addEventListener("submit", applyCustomizer);
    $("#copy-config").addEventListener("click", copyCurrentConfig);

    [elements.primaryCta, elements.mobileCta].forEach((cta) => {
      cta.addEventListener("click", (event) => {
        if (cta.getAttribute("aria-disabled") === "true") event.preventDefault();
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

    const mode = config.registration.mode;
    if (mode === "external" && config.registration.providerHandlesForm) {
      elements.fields.hidden = true;
      $(".consent-group", elements.form).hidden = true;
      $(".form-heading h3", elements.form).textContent = "신청·결제 페이지로 이동";
      $(".required-note", elements.form).hidden = true;
    }
    setText(
      "#form-footnote",
      mode === "preview"
        ? "현재 미리보기 모드입니다. 입력 내용은 저장되거나 전송되지 않습니다."
        : mode === "external"
          ? "신청과 결제는 연결된 외부 제공자의 안전한 페이지에서 완료됩니다."
          : "결제 승인 전에는 참여가 확정되지 않습니다.",
    );
  }

  initialize().catch(() => {
    document.body.innerHTML =
      '<main style="padding:40px;font-family:system-ui"><h1>페이지를 불러오지 못했습니다.</h1><p>잠시 뒤 다시 시도해 주세요.</p></main>';
  });
})();
