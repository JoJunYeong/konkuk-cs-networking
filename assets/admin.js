import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const runtime = window.KU_ADMIN_FIREBASE;
const sourceConfig = window.NETWORKING_SITE_CONFIG;

if (!runtime?.firebase?.projectId || !sourceConfig?.events) {
  document.body.innerHTML = "<main style='padding:40px'>관리자 설정 파일을 확인해 주세요.</main>";
  throw new Error("admin_configuration_missing");
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

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const firebaseApp = initializeApp(runtime.firebase);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const state = {
  events: clone(sourceConfig.events),
  history: { schemaVersion: 1, sourceNote: "", events: [] },
  selectedEventId: sourceConfig.events[0]?.id || "",
  selectedHistoryId: "",
  selectedRegistrationEventId: sourceConfig.events.find((event) => event.featured)?.id || sourceConfig.events[0]?.id || "",
  registrations: [],
  refunds: new Map(),
  registrationDataLoaded: false,
  ready: false,
};

const elements = {
  loginPanel: $("#login-panel"),
  loginForm: $("#login-form"),
  loginMessage: $("#login-message"),
  dashboard: $("#dashboard"),
  syncStatus: $("#sync-status"),
  accountName: $("#account-name"),
  eventSelect: $("#event-select"),
  eventLoadSummary: $("#event-load-summary"),
  eventForm: $("#event-form"),
  registrationEventSelect: $("#registration-event-select"),
  registrationRows: $("#registration-rows"),
  registrationEmpty: $("#registration-empty"),
  bankTransactions: $("#bank-transactions"),
  matchStatus: $("#match-status"),
  historySelect: $("#history-select"),
  historyForm: $("#history-form"),
};

function showLoginMessage(message) {
  elements.loginMessage.textContent = message;
}

function showSyncStatus(message, isError = false) {
  elements.syncStatus.textContent = message;
  elements.syncStatus.classList.toggle("is-error", isError);
}

function setBusy(form, busy) {
  $$('button[type="submit"]', form).forEach((button) => {
    button.disabled = busy;
  });
}

function documentRef(name) {
  return doc(db, runtime.collection, runtime.documents[name]);
}

async function readPayload(name) {
  const snapshot = await getDoc(documentRef(name));
  if (!snapshot.exists()) return null;
  const payload = snapshot.data()?.payload;
  if (typeof payload !== "string") return null;
  return JSON.parse(payload);
}

async function writePayload(name, payload) {
  await setDoc(documentRef(name), {
    payload: JSON.stringify(payload),
    updatedAt: serverTimestamp(),
    updatedBy: runtime.adminUsername,
  });
}

function eventRegistrationMode(event) {
  const mode = event?.registrationMode || sourceConfig.registration?.mode || "external";
  return mode === "manual_transfer" ? "manual_transfer" : "external";
}

function bankTransferReady(event) {
  const amount = Number(event?.paymentAmount);
  return Boolean(
    String(event?.bankName || "").trim()
    && String(event?.bankAccountHolder || "").trim()
    && String(event?.bankAccountNumber || "").trim()
    && Number.isInteger(amount)
    && amount > 0,
  );
}

async function writeEventsAndGates(events) {
  const gateSnapshots = await getDocs(collection(db, "registrationGates"));
  const currentIds = new Set(events.map((event) => event.id));
  const batch = writeBatch(db);

  batch.set(documentRef("events"), {
    payload: JSON.stringify(events),
    updatedAt: serverTimestamp(),
    updatedBy: runtime.adminUsername,
  });

  events.forEach((event) => {
    const mode = eventRegistrationMode(event);
    const amount = Number(event.paymentAmount);
    batch.set(doc(db, "registrationGates", event.id), {
      eventId: event.id,
      eventQuarter: String(event.quarter || event.id).slice(0, 40),
      mode,
      amount: Number.isInteger(amount) && amount > 0 ? amount : 0,
      capacity: Math.max(1, Number(event.capacity) || 1),
      accepting: event.status === "open" && mode === "manual_transfer" && bankTransferReady(event),
      updatedAt: serverTimestamp(),
    });
  });

  gateSnapshots.forEach((snapshot) => {
    if (currentIds.has(snapshot.id)) return;
    batch.set(snapshot.ref, {
      ...snapshot.data(),
      accepting: false,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

async function loadStaticHistory() {
  const response = await fetch("./data/history.json", { cache: "no-store" });
  if (!response.ok) throw new Error("history_fallback_failed");
  return response.json();
}

async function loadDashboardData() {
  showSyncStatus("저장된 자료를 확인하는 중입니다.");

  const [managedEvents, managedHistory, staticHistory] = await Promise.all([
    readPayload("events"),
    readPayload("history"),
    loadStaticHistory(),
  ]);

  state.events = Array.isArray(managedEvents) && managedEvents.length > 0
    ? mergeEventCollections(clone(sourceConfig.events), managedEvents)
    : clone(sourceConfig.events);
  state.history = managedHistory?.events ? managedHistory : staticHistory;

  if (!managedEvents) await writePayload("events", state.events);
  if (!managedHistory) await writePayload("history", state.history);

  state.selectedEventId = initialEventId(state.events);
  state.selectedRegistrationEventId = state.selectedEventId;
  state.selectedHistoryId = state.history.events[0]?.id || "";
  state.ready = true;
  renderEventSelect();
  renderRegistrationEventSelect();
  renderHistorySelect();
  const currentOrFutureCount = state.events.filter(isCurrentOrFutureEvent).length;
  const selected = currentEvent();
  if (!selected || value(elements.eventForm, "id") !== selected.id) {
    throw new Error("event_form_load_failed");
  }
  showSyncStatus(
    `${state.events.length}개 회차를 불러왔습니다. 현재·향후 ${currentOrFutureCount}개 중 ${selected.quarter} 자료를 편집기에 표시했습니다.`,
  );
}

function value(form, name) {
  return String(form.elements[name]?.value || "").trim();
}

function setValue(form, name, data) {
  const control = form.elements[name];
  if (!control) return;
  if (control.type === "checkbox") control.checked = Boolean(data);
  else control.value = data ?? "";
}

function agendaToText(agenda) {
  return (Array.isArray(agenda) ? agenda : [])
    .map((item) => [item.time, item.title, item.description].join(" | "))
    .join("\n");
}

function quarterIndex(event) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(event?.id || ""));
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : null;
}

function currentQuarterIndex() {
  const now = new Date();
  return now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
}

function isCurrentOrFutureEvent(event) {
  const index = quarterIndex(event);
  return index !== null && index >= currentQuarterIndex();
}

function initialEventId(events) {
  const currentOrFuture = events.filter(isCurrentOrFutureEvent);
  return currentOrFuture.find((event) => event.featured)?.id
    || currentOrFuture.find((event) => event.status === "open")?.id
    || currentOrFuture[0]?.id
    || events.find((event) => event.featured)?.id
    || events.at(-1)?.id
    || "";
}

function textToAgenda(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [time = "", title = "", ...description] = line.split("|").map((part) => part.trim());
      return { time, title, description: description.join(" | ") };
    })
    .filter((item) => item.time && item.title);
}

function currentEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function renderEventSelect() {
  elements.eventSelect.replaceChildren();
  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    const mode = eventRegistrationMode(event);
    const routeWarning = event.status !== "open"
      ? ""
      : mode === "manual_transfer" && !bankTransferReady(event)
        ? " · 입금 계좌 없음"
        : mode === "external" && !event.registrationUrl
          ? " · 신청 링크 없음"
          : "";
    option.textContent = `${event.quarter} · ${event.statusLabel}${routeWarning}`;
    option.selected = event.id === state.selectedEventId;
    elements.eventSelect.append(option);
  });
  renderEventForm();
}

function renderEventForm() {
  const event = currentEvent();
  if (!event) {
    elements.eventLoadSummary.textContent = "선택한 회차 자료를 찾지 못했습니다.";
    return;
  }
  [
    "id", "quarter", "sequence", "status", "statusLabel", "titleLineOne", "titleLineTwo",
    "description", "notice", "dateLabel", "time", "venue", "locationNotice", "priceLabel",
    "capacity", "registrationUrl", "bankName", "bankAccountHolder", "bankAccountNumber",
    "paymentAmount", "refundDeadlineLabel", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => setValue(elements.eventForm, name, event[name]));
  setValue(elements.eventForm, "registrationMode", eventRegistrationMode(event));
  setValue(
    elements.eventForm,
    "registrationProvider",
    event.registrationProvider || sourceConfig.registration?.provider || "onoffmix",
  );
  setValue(elements.eventForm, "featured", event.featured);
  setValue(elements.eventForm, "agenda", agendaToText(event.agenda));
  updateRegistrationModeFields();
  elements.eventLoadSummary.textContent = `${event.quarter}에 저장된 자료를 아래 입력칸에 불러왔습니다.`;
}

function updateRegistrationModeFields() {
  const mode = value(elements.eventForm, "registrationMode") || "external";
  $$('[data-registration-mode-fields]', elements.eventForm).forEach((section) => {
    section.hidden = section.dataset.registrationModeFields !== mode;
  });
}

function collectEventForm() {
  const event = currentEvent();
  if (!event) return;
  const previousId = event.id;
  [
    "id", "quarter", "sequence", "status", "statusLabel", "titleLineOne", "titleLineTwo",
    "description", "notice", "dateLabel", "time", "venue", "locationNotice", "priceLabel",
    "registrationMode", "registrationProvider", "registrationUrl", "bankName", "bankAccountHolder",
    "bankAccountNumber", "refundDeadlineLabel", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => {
    event[name] = value(elements.eventForm, name);
  });
  event.address = "";
  event.capacity = Number(elements.eventForm.elements.capacity.value) || 1;
  event.paymentAmount = Number(elements.eventForm.elements.paymentAmount.value) || 0;
  event.featured = elements.eventForm.elements.featured.checked;
  event.agenda = textToAgenda(elements.eventForm.elements.agenda.value);
  event.revision = Date.now();
  if (event.id !== previousId) state.selectedEventId = event.id;
}

function nextQuarter() {
  const parsed = state.events
    .map((event) => /^(\d{4})-Q([1-4])$/.exec(event.id))
    .filter(Boolean)
    .map((match) => Number(match[1]) * 4 + Number(match[2]) - 1)
    .sort((a, b) => b - a)[0] ?? new Date().getFullYear() * 4;
  const next = parsed + 1;
  const year = Math.floor(next / 4);
  const quarter = (next % 4) + 1;
  return { id: `${year}-Q${quarter}`, label: `${year} Q${quarter}` };
}

function addEvent() {
  collectEventForm();
  const next = nextQuarter();
  const event = {
    id: next.id,
    quarter: next.label,
    sequence: String(state.events.length + 1).padStart(2, "0"),
    status: "upcoming",
    statusLabel: "예정",
    featured: false,
    revision: Date.now(),
    eyebrow: `KONKUK CSE ALUMNI · ${next.label}`,
    titleLineOne: "다음 모임을",
    titleLineTwo: "준비하고 있습니다.",
    description: "일정과 장소가 정해지는 대로 알려드리겠습니다.",
    notice: "동문이 직접 준비하는 비공식 모임",
    dateLabel: "일정 확정 후 공개",
    time: "시간 확정 후 공개",
    venue: "장소 확정 후 공개",
    address: "",
    priceLabel: "참가비 확정 전",
    capacity: 40,
    registrationMode: "manual_transfer",
    registrationProvider: "onoffmix",
    registrationUrl: "",
    bankName: "",
    bankAccountHolder: "",
    bankAccountNumber: "",
    paymentAmount: 0,
    refundDeadlineLabel: "추후 공개",
    locationNotice: "정확한 장소는 신청·결제 완료자에게 운영자가 별도로 안내합니다.",
    applicationLabel: "오픈 예정",
    applicationCopy: "신청 시작일이 정해지면 이곳에서 안내하겠습니다.",
    aboutIntro: "학교와 일 이야기를 편하게 나누는 자리입니다.",
    quote: "선후배끼리 얼굴 한 번 보고, 다음에 연락할 수 있으면 충분합니다.",
    programDescription: "진행 순서는 일정이 정해진 뒤 공개하겠습니다.",
    agenda: [],
  };
  state.events.push(event);
  state.selectedEventId = event.id;
  renderEventSelect();
  showSyncStatus("새 회차를 만들었습니다. 내용을 확인한 뒤 저장해 주세요.");
}

function deleteEvent() {
  if (state.events.length <= 1) {
    showSyncStatus("행사는 최소 한 회차가 있어야 합니다.", true);
    return;
  }
  const event = currentEvent();
  if (!event || !window.confirm(`${event.quarter} 회차를 목록에서 지울까요? 저장 전에는 공개 페이지에 반영되지 않습니다.`)) return;
  state.events = state.events.filter((item) => item !== event);
  state.selectedEventId = state.events[0].id;
  renderEventSelect();
  showSyncStatus("회차를 목록에서 뺐습니다. 확정하려면 저장해 주세요.");
}

function validateEvents() {
  const ids = new Set();
  for (const event of state.events) {
    if (!/^\d{4}-Q[1-4]$/.test(event.id)) throw new Error("회차 ID는 2027-Q1 형식으로 적어 주세요.");
    if (ids.has(event.id)) throw new Error("같은 회차 ID가 두 번 들어 있습니다.");
    ids.add(event.id);
    if (!event.quarter || !event.titleLineOne || !event.dateLabel || !event.venue) throw new Error("필수 항목을 모두 입력해 주세요.");
    if (!Number.isFinite(event.capacity) || event.capacity < 1) throw new Error("정원을 확인해 주세요.");
    const mode = eventRegistrationMode(event);
    if (mode === "external" && event.registrationUrl) {
      let parsed;
      try {
        parsed = new URL(event.registrationUrl);
      } catch (_error) {
        throw new Error("신청 URL 형식을 확인해 주세요.");
      }
      if (parsed.protocol !== "https:") throw new Error("신청 URL은 https:// 주소만 사용할 수 있습니다.");
    }
    if (mode === "external" && event.status === "open" && !event.registrationUrl) {
      throw new Error(`${event.quarter} 외부 신청 URL을 입력해 주세요.`);
    }
    if (mode === "manual_transfer") {
      const accountDigits = String(event.bankAccountNumber || "").replace(/\D/g, "");
      if (event.bankAccountNumber && !/^\d{8,20}$/.test(accountDigits)) {
        throw new Error(`${event.quarter} 계좌번호를 확인해 주세요.`);
      }
      if (event.paymentAmount && (!Number.isInteger(event.paymentAmount) || event.paymentAmount < 1 || event.paymentAmount > 1000000)) {
        throw new Error(`${event.quarter} 입금액을 확인해 주세요.`);
      }
      if (event.status === "open" && !bankTransferReady(event)) {
        throw new Error(`${event.quarter} 은행·예금주·계좌번호·입금액을 모두 입력해야 신청을 열 수 있습니다.`);
      }
      if (event.status === "open" && !event.refundDeadlineLabel) {
        throw new Error(`${event.quarter} 환불 요청 마감을 입력해 주세요.`);
      }
    }
  }
  if (!state.events.some((event) => event.featured)) state.events[0].featured = true;
  const featured = state.events.filter((event) => event.featured);
  if (featured.length > 1) {
    const keep = featured.find((event) => event.id === state.selectedEventId) || featured[0];
    state.events.forEach((event) => { event.featured = event === keep; });
  }
}

async function saveEvents(event) {
  event.preventDefault();
  setBusy(elements.eventForm, true);
  try {
    collectEventForm();
    validateEvents();
    await writeEventsAndGates(state.events);
    renderEventSelect();
    renderRegistrationEventSelect();
    const saved = currentEvent();
    showSyncStatus(
      saved && eventRegistrationMode(saved) === "manual_transfer" && saved.status === "open"
        ? "행사와 자체 계좌이체 모집 게이트를 함께 저장했습니다. 공개 페이지에서 신청을 받을 수 있습니다."
        : "분기별 행사 내용을 저장했습니다. 공개 신청 버튼에도 반영됩니다.",
      false,
    );
  } catch (error) {
    showSyncStatus(error?.message || "행사 내용을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.eventForm, false);
  }
}

function renderRegistrationEventSelect() {
  if (!state.events.some((event) => event.id === state.selectedRegistrationEventId)) {
    state.selectedRegistrationEventId = state.selectedEventId || state.events[0]?.id || "";
  }
  elements.registrationEventSelect.replaceChildren();
  state.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.quarter} · ${event.statusLabel}`;
    option.selected = event.id === state.selectedRegistrationEventId;
    elements.registrationEventSelect.append(option);
  });
  if (state.registrationDataLoaded) renderRegistrationRows();
}

function registrationCreatedAt(registration) {
  if (typeof registration.createdAt?.toDate === "function") return registration.createdAt.toDate();
  const seconds = Number(registration.createdAt?.seconds);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

function formatRegistrationTime(registration) {
  const date = registrationCreatedAt(registration);
  if (!date || Number.isNaN(date.getTime())) return "시간 확인 중";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAmount(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}원` : "—";
}

function registrationStatusLabel(status) {
  return {
    payment_reported: "입금확인 대기",
    confirmed: "참여 확정",
    refund_completed: "환불 완료",
    canceled_unpaid: "미입금 취소",
  }[status] || status || "상태 미상";
}

function statusBadgeClass(status) {
  if (status === "confirmed") return "status-badge status-badge--confirmed";
  if (["refund_completed", "canceled_unpaid"].includes(status)) return "status-badge status-badge--refund";
  return "status-badge status-badge--pending";
}

function selectedEventRegistrations() {
  return state.registrations
    .filter((registration) => registration.eventId === state.selectedRegistrationEventId)
    .sort((a, b) => (registrationCreatedAt(b)?.getTime() || 0) - (registrationCreatedAt(a)?.getTime() || 0));
}

function appendTextCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderRefundCell(cell, registration) {
  const refund = state.refunds.get(registration.id);
  if (!refund) {
    cell.textContent = "—";
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "refund-cell";
  const badge = document.createElement("span");
  badge.className = "status-badge status-badge--refund";
  badge.textContent = refund.status === "refund_requested"
    ? "환불 요청"
    : refund.status === "refunded"
      ? "환불 완료"
      : "미입금 취소";
  wrapper.append(badge);

  if (refund.status === "refund_requested") {
    const account = document.createElement("small");
    account.textContent = `${refund.refundBank} · ${refund.refundAccount} · ${refund.refundAccountHolder}`;
    wrapper.append(account);

    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "admin-button admin-button--primary";
    complete.dataset.refundAction = "complete";
    complete.dataset.registrationId = registration.id;
    complete.textContent = "송금 후 환불 완료";

    const unpaid = document.createElement("button");
    unpaid.type = "button";
    unpaid.className = "admin-button";
    unpaid.dataset.refundAction = "unpaid";
    unpaid.dataset.registrationId = registration.id;
    unpaid.textContent = "실제 미입금으로 취소";
    wrapper.append(complete, unpaid);
  } else {
    const resolved = document.createElement("small");
    resolved.textContent = refund.refundAccountLast4
      ? `파기된 계좌 끝 4자리 ${refund.refundAccountLast4}`
      : "환불 계좌정보 파기 완료";
    wrapper.append(resolved);
  }

  cell.append(wrapper);
}

function renderRegistrationRows() {
  const registrations = selectedEventRegistrations();
  elements.registrationRows.replaceChildren();
  elements.registrationEmpty.hidden = registrations.length > 0;
  elements.registrationRows.closest(".registration-table-wrap").hidden = registrations.length === 0;

  registrations.forEach((registration) => {
    const refund = state.refunds.get(registration.id);
    const row = document.createElement("tr");
    row.dataset.registrationId = registration.id;

    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.registrationSelect = registration.id;
    checkbox.setAttribute("aria-label", `${registration.name} 입금확정 선택`);
    checkbox.disabled = registration.status !== "payment_reported" || refund?.status === "refund_requested";
    checkbox.addEventListener("change", () => row.classList.toggle("is-matched", checkbox.checked));
    selectCell.append(checkbox);
    row.append(selectCell);

    appendTextCell(row, formatRegistrationTime(registration));

    const personCell = document.createElement("td");
    const person = document.createElement("div");
    person.className = "registration-person";
    const name = document.createElement("strong");
    name.textContent = registration.name || "—";
    const phone = document.createElement("small");
    phone.textContent = registration.phone || registration.phoneDigits || "—";
    const code = document.createElement("small");
    code.textContent = `신청번호 ${registration.id}`;
    person.append(name, phone, code);
    personCell.append(person);
    row.append(personCell);

    appendTextCell(row, registration.depositorName || "—");
    appendTextCell(row, formatAmount(registration.amount));

    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = statusBadgeClass(registration.status);
    status.textContent = registrationStatusLabel(registration.status);
    statusCell.append(status);
    row.append(statusCell);

    const refundCell = document.createElement("td");
    renderRefundCell(refundCell, registration);
    row.append(refundCell);
    elements.registrationRows.append(row);
  });

  const activeRefunds = registrations.filter(
    (registration) => state.refunds.get(registration.id)?.status === "refund_requested",
  ).length;
  $("#stat-total").textContent = String(registrations.length);
  $("#stat-pending").textContent = String(registrations.filter((item) => item.status === "payment_reported").length);
  $("#stat-confirmed").textContent = String(registrations.filter((item) => item.status === "confirmed").length);
  $("#stat-refunds").textContent = String(activeRefunds);
}

async function loadRegistrationData() {
  elements.matchStatus.textContent = "신청자와 환불 요청을 불러오는 중입니다.";
  elements.matchStatus.classList.remove("is-error");
  try {
    const [registrationSnapshots, refundSnapshots] = await Promise.all([
      getDocs(collection(db, "registrations")),
      getDocs(collection(db, "refundRequests")),
    ]);
    state.registrations = registrationSnapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
    state.refunds = new Map(
      refundSnapshots.docs.map((snapshot) => [snapshot.id, { id: snapshot.id, ...snapshot.data() }]),
    );
    state.registrationDataLoaded = true;
    renderRegistrationRows();
    elements.matchStatus.textContent = "최신 신청 자료를 불러왔습니다. 붙여 넣은 은행 내역은 저장하지 않습니다.";
  } catch (_error) {
    elements.matchStatus.textContent = "신청 자료를 불러오지 못했습니다. 보안 규칙과 로그인 상태를 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
  }
}

function normalizedDepositorName(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function parseBankTransactions(raw) {
  const parsed = [];
  let invalid = 0;
  String(raw || "").split("\n").map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const parts = line.includes("\t")
      ? line.split("\t")
      : line.includes("|")
        ? line.split("|")
        : [];
    if (parts.length < 2) {
      invalid += 1;
      return;
    }
    const name = parts[0].trim();
    const amountText = parts.at(-1).replace(/[^0-9-]/g, "");
    const amount = Number(amountText);
    if (!name || !Number.isInteger(amount) || amount <= 0) {
      invalid += 1;
      return;
    }
    parsed.push({ name, amount });
  });
  return { parsed, invalid };
}

function matchTransactions() {
  const { parsed, invalid } = parseBankTransactions(elements.bankTransactions.value);
  $$('[data-registration-select]', elements.registrationRows).forEach((checkbox) => {
    checkbox.checked = false;
    checkbox.closest("tr").classList.remove("is-matched");
  });

  if (parsed.length === 0) {
    elements.matchStatus.textContent = "입금자명과 금액 두 열을 탭으로 구분해 한 줄씩 붙여 넣어 주세요.";
    elements.matchStatus.classList.add("is-error");
    return;
  }

  const pending = selectedEventRegistrations().filter((registration) => {
    return registration.status === "payment_reported"
      && state.refunds.get(registration.id)?.status !== "refund_requested";
  });
  const transactionsByKey = new Map();
  parsed.forEach((transaction) => {
    const key = `${normalizedDepositorName(transaction.name)}:${transaction.amount}`;
    transactionsByKey.set(key, (transactionsByKey.get(key) || 0) + 1);
  });
  const registrationsByKey = new Map();
  pending.forEach((registration) => {
    const key = `${normalizedDepositorName(registration.depositorName)}:${Number(registration.amount)}`;
    const items = registrationsByKey.get(key) || [];
    items.push(registration);
    registrationsByKey.set(key, items);
  });

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  transactionsByKey.forEach((transactionCount, key) => {
    const candidates = registrationsByKey.get(key) || [];
    if (transactionCount === 1 && candidates.length === 1) {
      const checkbox = $(`[data-registration-select="${candidates[0].id}"]`, elements.registrationRows);
      if (checkbox && !checkbox.disabled) {
        checkbox.checked = true;
        checkbox.closest("tr").classList.add("is-matched");
        matched += 1;
      }
    } else if (candidates.length > 0) {
      ambiguous += transactionCount;
    } else {
      unmatched += transactionCount;
    }
  });

  elements.matchStatus.classList.toggle("is-error", matched === 0);
  elements.matchStatus.textContent = `자동 선택 ${matched}건 · 중복/동명이인 ${ambiguous}건 · 신청과 불일치 ${unmatched}건${invalid ? ` · 형식 오류 ${invalid}줄` : ""}. 확정 전 선택 건을 확인하세요.`;
}

async function confirmSelectedRegistrations() {
  const ids = $$('[data-registration-select]:checked', elements.registrationRows).map(
    (checkbox) => checkbox.dataset.registrationSelect,
  );
  if (ids.length === 0) {
    elements.matchStatus.textContent = "입금확정할 신청을 먼저 선택해 주세요.";
    elements.matchStatus.classList.add("is-error");
    return;
  }

  const event = state.events.find((item) => item.id === state.selectedRegistrationEventId);
  const confirmedCount = selectedEventRegistrations().filter((item) => item.status === "confirmed").length;
  if (event && confirmedCount + ids.length > Number(event.capacity || 0)) {
    elements.matchStatus.textContent = "선택 건을 확정하면 정원을 넘습니다. 신청 상태와 정원을 먼저 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
    return;
  }
  if (!window.confirm(`${ids.length}건의 실제 입금자명과 금액을 은행 내역에서 확인했나요? 확인한 건만 참여 확정합니다.`)) return;

  const button = $("#confirm-selected");
  button.disabled = true;
  try {
    const batch = writeBatch(db);
    ids.forEach((registrationId) => {
      batch.update(doc(db, "registrations", registrationId), {
        status: "confirmed",
        confirmedAt: serverTimestamp(),
        confirmedBy: runtime.adminUsername,
      });
    });
    await batch.commit();
    elements.bankTransactions.value = "";
    await loadRegistrationData();
    elements.matchStatus.textContent = `${ids.length}건을 참여 확정으로 기록했습니다.`;
  } catch (_error) {
    elements.matchStatus.textContent = "입금확정 상태를 저장하지 못했습니다. 새로고침 후 다시 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
}

async function resolveRefund(registrationId, outcome) {
  const registration = state.registrations.find((item) => item.id === registrationId);
  const refund = state.refunds.get(registrationId);
  if (!registration || !refund || refund.status !== "refund_requested") return;

  const completed = outcome === "complete";
  const prompt = completed
    ? `${registration.name}님에게 ${refund.refundBank} ${refund.refundAccount} 계좌로 실제 환불 송금을 완료했나요?`
    : `${registration.name}님의 실제 입금이 없음을 은행 내역에서 확인했나요? 환불 없이 신청을 취소합니다.`;
  if (!window.confirm(prompt)) return;

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, "registrations", registrationId), {
      status: completed ? "refund_completed" : "canceled_unpaid",
      refundedAt: serverTimestamp(),
      refundedBy: runtime.adminUsername,
    });
    batch.update(doc(db, "refundRequests", registrationId), {
      status: completed ? "refunded" : "resolved_unpaid",
      refundAccountLast4: String(refund.refundAccount || "").slice(-4),
      refundBank: deleteField(),
      refundAccount: deleteField(),
      refundAccountHolder: deleteField(),
      resolvedAt: serverTimestamp(),
      resolvedBy: runtime.adminUsername,
    });
    await batch.commit();
    await loadRegistrationData();
    elements.matchStatus.textContent = completed
      ? "환불 완료를 기록하고 환불 계좌정보를 파기했습니다."
      : "미입금 취소를 기록하고 환불 계좌정보를 파기했습니다.";
  } catch (_error) {
    elements.matchStatus.textContent = "환불 처리 상태를 저장하지 못했습니다. 실제 송금 여부를 다시 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
  }
}

function currentHistory() {
  return state.history.events.find((event) => event.id === state.selectedHistoryId) || null;
}

function renderHistorySelect() {
  elements.historySelect.replaceChildren();
  state.history.events.forEach((event) => {
    const option = document.createElement("option");
    option.value = event.id;
    option.textContent = `${event.date} · ${event.title}`;
    option.selected = event.id === state.selectedHistoryId;
    elements.historySelect.append(option);
  });
  renderHistoryForm();
}

function renderHistoryForm() {
  const event = currentHistory();
  if (!event) return;
  ["id", "sequence", "date", "attendees", "title", "venue", "summary", "learning"].forEach((name) => {
    setValue(elements.historyForm, name, event[name]);
  });
  setValue(elements.historyForm, "highlights", (event.highlights || []).join(", "));
}

function collectHistoryForm() {
  const event = currentHistory();
  if (!event) return;
  const previousId = event.id;
  ["id", "date", "title", "venue", "summary", "learning"].forEach((name) => {
    event[name] = value(elements.historyForm, name);
  });
  event.sequence = Number(elements.historyForm.elements.sequence.value) || 1;
  event.attendees = Number(elements.historyForm.elements.attendees.value) || 0;
  event.highlights = value(elements.historyForm, "highlights")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (event.id !== previousId) state.selectedHistoryId = event.id;
}

function addHistory() {
  collectHistoryForm();
  const sequence = Math.max(0, ...state.history.events.map((event) => Number(event.sequence) || 0)) + 1;
  const year = new Date().getFullYear();
  const event = {
    id: `networking-day-${year}-${String(sequence).padStart(2, "0")}`,
    sequence,
    date: new Date().toISOString().slice(0, 10),
    title: `${year}년 제${sequence}회 Networking Day`,
    venue: "",
    attendees: 0,
    summary: "",
    highlights: [],
    learning: "",
  };
  state.history.events.push(event);
  state.selectedHistoryId = event.id;
  renderHistorySelect();
  showSyncStatus("새 기록을 만들었습니다. 공개할 내용만 적어 주세요.");
}

function deleteHistory() {
  const event = currentHistory();
  if (!event || !window.confirm(`${event.title} 기록을 목록에서 지울까요? 저장 전에는 공개 페이지에 반영되지 않습니다.`)) return;
  state.history.events = state.history.events.filter((item) => item !== event);
  state.selectedHistoryId = state.history.events[0]?.id || "";
  renderHistorySelect();
  showSyncStatus("기록을 목록에서 뺐습니다. 확정하려면 저장해 주세요.");
}

function validatePublicHistory() {
  const serialized = JSON.stringify(state.history.events);
  if (/\b\d{7,}\b/.test(serialized)) throw new Error("7자리 이상 이어진 숫자가 있습니다. 연락처나 계좌번호인지 확인해 주세요.");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized)) throw new Error("이메일 주소는 지난 기록에 공개하지 않습니다.");
  if (/(계좌번호|은행계좌|연락처|전화번호)/.test(serialized)) throw new Error("개인정보로 보이는 문구가 있습니다. 공개용 내용만 남겨 주세요.");
  state.history.events.forEach((event) => {
    if (!event.id || !event.date || !event.title || !event.venue || !event.summary) throw new Error("필수 항목을 모두 입력해 주세요.");
  });
}

async function saveHistory(event) {
  event.preventDefault();
  setBusy(elements.historyForm, true);
  try {
    collectHistoryForm();
    validatePublicHistory();
    state.history.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    await writePayload("history", state.history);
    renderHistorySelect();
    showSyncStatus("지난 기록을 저장했습니다.");
  } catch (error) {
    showSyncStatus(error?.message || "지난 기록을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.historyForm, false);
  }
}

function switchTab(name) {
  $$('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$('[data-admin-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== name;
  });
  if (name === "registrations" && !state.registrationDataLoaded) loadRegistrationData();
}

async function login(event) {
  event.preventDefault();
  const username = value(elements.loginForm, "username");
  const password = elements.loginForm.elements.password.value;
  elements.loginForm.elements.password.value = "";
  if (username !== runtime.adminUsername) {
    showLoginMessage("아이디 또는 비밀번호를 확인해 주세요.");
    return;
  }

  setBusy(elements.loginForm, true);
  showLoginMessage("로그인하는 중입니다.");
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, runtime.loginEmail, password);
  } catch (_error) {
    showLoginMessage("아이디 또는 비밀번호를 확인해 주세요.");
  } finally {
    setBusy(elements.loginForm, false);
  }
}

async function showDashboard(user) {
  if (user.email !== runtime.loginEmail) {
    await signOut(auth);
    showLoginMessage("이 계정에는 관리자 권한이 없습니다.");
    return;
  }
  elements.accountName.textContent = runtime.adminUsername;
  elements.loginPanel.hidden = true;
  elements.dashboard.hidden = false;
  try {
    await loadDashboardData();
  } catch (_error) {
    showSyncStatus("관리 자료를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.", true);
  }
}

function showLogin() {
  state.ready = false;
  state.registrations = [];
  state.refunds = new Map();
  state.registrationDataLoaded = false;
  elements.registrationRows.replaceChildren();
  elements.bankTransactions.value = "";
  elements.dashboard.hidden = true;
  elements.loginPanel.hidden = false;
}

elements.loginForm.addEventListener("submit", login);
$("#logout-button").addEventListener("click", () => signOut(auth));
elements.eventSelect.addEventListener("change", () => {
  collectEventForm();
  state.selectedEventId = elements.eventSelect.value;
  renderEventForm();
});
elements.historySelect.addEventListener("change", () => {
  collectHistoryForm();
  state.selectedHistoryId = elements.historySelect.value;
  renderHistoryForm();
});
elements.eventForm.addEventListener("submit", saveEvents);
elements.eventForm.elements.registrationMode.addEventListener("change", updateRegistrationModeFields);
elements.historyForm.addEventListener("submit", saveHistory);
elements.registrationEventSelect.addEventListener("change", () => {
  state.selectedRegistrationEventId = elements.registrationEventSelect.value;
  renderRegistrationRows();
});
$("#refresh-registrations").addEventListener("click", loadRegistrationData);
$("#match-transactions").addEventListener("click", matchTransactions);
$("#confirm-selected").addEventListener("click", confirmSelectedRegistrations);
elements.registrationRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-refund-action]");
  if (!button) return;
  resolveRefund(button.dataset.registrationId, button.dataset.refundAction);
});
$("#open-registration-desk").addEventListener("click", () => switchTab("registrations"));
$("#add-event").addEventListener("click", addEvent);
$("#delete-event").addEventListener("click", deleteEvent);
$("#add-history").addEventListener("click", addHistory);
$("#delete-history").addEventListener("click", deleteHistory);
$$('[data-admin-tab]').forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.adminTab)));

onAuthStateChanged(auth, (user) => {
  if (user) showDashboard(user);
  else showLogin();
});
