import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  collection,
  connectFirestoreEmulator,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const runtime = window.KU_ADMIN_FIREBASE;
const sourceConfig = window.NETWORKING_SITE_CONFIG;
const { deadlineMillis, deadlinePassed, effectiveStatus, toInputValue, fromInputValue, formatDeadline } = window.KURegistrationTime;
const { participantTypes, participantLabel, validFee, hasSeparateFees, feeAmounts, feesReady, feeSummary } = window.KURegistrationFees;

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

function localEmulators() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return null;
  const query = new URLSearchParams(location.search);
  if (!query.has("firestoreEmulator") && !query.has("authEmulator")) return null;
  const firestore = /^(localhost|127\.0\.0\.1):(\d{2,5})$/.exec(query.get("firestoreEmulator") || "");
  const authentication = /^(localhost|127\.0\.0\.1):(\d{2,5})$/.exec(query.get("authEmulator") || "");
  if (!firestore || !authentication) throw new Error("Both local emulators are required");
  return { firestore, authentication };
}

const emulators = localEmulators();
const firebaseApp = initializeApp(emulators ? { ...runtime.firebase, projectId: "demo-ku-networking", authDomain: "localhost" } : runtime.firebase);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
if (emulators) {
  connectAuthEmulator(auth, `http://${emulators.authentication[0]}`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulators.firestore[1], Number(emulators.firestore[2]));
}

const state = {
  events: clone(sourceConfig.events),
  history: { schemaVersion: 1, sourceNote: "", events: [] },
  selectedEventId: sourceConfig.events[0]?.id || "",
  selectedHistoryId: "",
  selectedRegistrationEventId: sourceConfig.events.find((event) => event.featured)?.id || sourceConfig.events[0]?.id || "",
  registrations: [],
  refunds: new Map(),
  registrationDataLoaded: false,
  registrationLoading: false,
  registrationSaving: false,
  registrationFilter: "all",
  eventsDirty: false,
  historyDirty: false,
  savedEvents: [],
  savedHistory: null,
  remotePayloads: { events: null, history: null },
  actionResolver: null,
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
  if (busy && form.dataset.busy === "true") return;
  form.dataset.busy = String(busy);
  form.setAttribute("aria-busy", String(busy));
  $$('input, select, textarea, button', form).forEach((control) => {
    if (busy) {
      control.dataset.disabledBeforeSave = String(control.disabled);
      control.disabled = true;
    } else if (control.dataset.disabledBeforeSave !== undefined) {
      control.disabled = control.dataset.disabledBeforeSave === "true";
      delete control.dataset.disabledBeforeSave;
    }
  });
  if (form === elements.eventForm) {
    elements.eventSelect.disabled = busy;
    $("#add-event").disabled = busy;
    $("#reload-dashboard").disabled = busy;
  }
}

function confirmAction({ title, message, confirmLabel = "확인", items = [], danger = false }) {
  if (state.actionResolver) return Promise.resolve(false);
  $("#action-title").textContent = title;
  $("#action-message").textContent = message;
  $("#action-confirm").textContent = confirmLabel;
  $("#action-confirm").classList.toggle("admin-button--danger", danger);
  const list = $("#action-items");
  list.replaceChildren();
  items.forEach((text) => { const item = document.createElement("li"); item.textContent = text; list.append(item); });
  const dialog = $("#action-dialog");
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => { state.actionResolver = resolve; });
}

function updateDirtyStatus() {
  const busy = elements.eventForm.dataset.busy === "true";
  const status = $("#event-save-state");
  status.textContent = busy ? "저장 중…" : state.eventsDirty ? "저장하지 않은 변경 사항이 있습니다" : "변경 사항 없음";
  status.classList.toggle("is-dirty", state.eventsDirty);
  $("#save-events").disabled = busy || !state.eventsDirty || !state.ready;
  $("#discard-event-changes").disabled = busy || !state.eventsDirty;
  $("#history-save-state").textContent = state.historyDirty ? "저장하지 않은 변경 사항이 있습니다" : "변경 사항 없음";
  $("#save-history").disabled = elements.historyForm.dataset.busy === "true" || !state.historyDirty || !state.ready;
}

function markEventDirty() {
  if (!state.ready) return;
  state.eventsDirty = true;
  updateDirtyStatus();
  renderEventDraft();
}

function validateFormControls(form) {
  const invalid = [...form.elements].find((control) => control.willValidate && !control.checkValidity());
  if (!invalid) return true;
  let parent = invalid.parentElement;
  while (parent) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
  invalid.scrollIntoView({ block: "center", behavior: "instant" });
  invalid.focus({ preventScroll: true });
  invalid.reportValidity();
  return false;
}

function documentRef(name) {
  return doc(db, runtime.collection, runtime.documents[name]);
}

async function readPayload(name) {
  const snapshot = await getDoc(documentRef(name));
  state.remotePayloads[name] = snapshot.exists() ? snapshot.data()?.payload || null : null;
  if (!snapshot.exists()) return null;
  const payload = snapshot.data()?.payload;
  if (typeof payload !== "string") return null;
  return JSON.parse(payload);
}

async function writePayload(name, payload) {
  const serialized = JSON.stringify(payload);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(documentRef(name));
    if ((snapshot.data()?.payload || null) !== state.remotePayloads[name]) {
      throw new Error("다른 창에서 변경한 내용이 있습니다. 새로고침으로 최신 내용을 확인한 뒤 저장해 주세요.");
    }
    transaction.set(documentRef(name), { payload: serialized, updatedAt: serverTimestamp(), updatedBy: runtime.adminUsername });
  });
  state.remotePayloads[name] = serialized;
}

function eventRegistrationMode(event) {
  const mode = event?.registrationMode || sourceConfig.registration?.mode || "external";
  return mode === "manual_transfer" ? "manual_transfer" : "external";
}

function bankTransferReady(event) {
  return Boolean(
    String(event?.bankName || "").trim()
    && String(event?.bankAccountHolder || "").trim()
    && String(event?.bankAccountNumber || "").trim()
    && feesReady(event),
  );
}

async function writeEventsAndGates(events) {
  const currentIds = new Set(events.map((event) => event.id));
  const serialized = JSON.stringify(events);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(documentRef("events"));
    const previousPayload = snapshot.data()?.payload || null;
    if (previousPayload !== state.remotePayloads.events) {
      throw new Error("다른 창에서 행사 설정을 변경했습니다. 새로고침으로 최신 내용을 확인한 뒤 저장해 주세요.");
    }
    const previousEvents = previousPayload ? JSON.parse(previousPayload) : [];
    transaction.set(documentRef("events"), { payload: serialized, updatedAt: serverTimestamp(), updatedBy: runtime.adminUsername });
    events.forEach((event) => {
      const mode = eventRegistrationMode(event);
      const amounts = feeAmounts(event);
      const deadline = deadlineMillis(event.registrationDeadline);
      transaction.set(doc(db, "registrationGates", event.id), {
        eventId: event.id,
        eventQuarter: String(event.quarter || event.id).slice(0, 40),
        mode,
        amount: amounts.student === amounts.graduate ? amounts.student : 0,
        paymentAmounts: amounts,
        capacity: Math.max(1, Number(event.capacity) || 1),
        accepting: event.status === "open" && mode === "manual_transfer" && bankTransferReady(event),
        registrationDeadline: deadline === null ? null : Timestamp.fromMillis(deadline),
        updatedAt: serverTimestamp(),
      });
    });
    previousEvents.filter((event) => !currentIds.has(event.id)).forEach((event) => {
      transaction.set(doc(db, "registrationGates", event.id), {
        accepting: false, registrationDeadline: null, updatedAt: serverTimestamp(),
      }, { merge: true });
    });
  });
  state.remotePayloads.events = serialized;
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

  state.savedEvents = clone(state.events);
  state.savedHistory = clone(state.history);
  state.eventsDirty = false;
  state.historyDirty = false;

  state.selectedEventId = initialEventId(state.events);
  state.selectedRegistrationEventId = state.selectedEventId;
  state.selectedHistoryId = state.history.events[0]?.id || "";
  state.ready = true;
  renderEventSelect();
  renderRegistrationEventSelect();
  renderHistorySelect();
  const selected = currentEvent();
  if (!selected || value(elements.eventForm, "id") !== selected.id) {
    throw new Error("event_form_load_failed");
  }
  updateDirtyStatus();
  showSyncStatus(`${selected.quarter} 설정을 불러왔습니다.`);
  await loadRegistrationData();
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

function currentEvent() {
  return state.events.find((event) => event.id === state.selectedEventId) || null;
}

function previousSavedEvent() {
  const selectedQuarter = quarterIndex(currentEvent());
  if (selectedQuarter === null) return null;
  return state.savedEvents
    .filter((event) => quarterIndex(event) !== null && quarterIndex(event) < selectedQuarter)
    .sort((a, b) => quarterIndex(b) - quarterIndex(a))[0] || null;
}

function renderPreviousEventImport() {
  const source = previousSavedEvent();
  $("#previous-event-import").hidden = !source;
  $("#previous-event-import-status").textContent = "";
  const button = $("#import-previous-event");
  button.disabled = !source || !state.ready || elements.eventForm.dataset.busy === "true";
  if (!source) return;
  button.textContent = `${source.quarter} 내용 불러오기`;
  button.setAttribute("aria-label", `${source.quarter} 내용을 ${currentEvent().quarter}에 불러오기`);
}

async function importPreviousEvent() {
  if (!state.ready || elements.eventForm.dataset.busy === "true") return;
  const target = currentEvent();
  const previous = previousSavedEvent();
  if (!target || !previous) return;
  const source = clone(previous);
  if (!await confirmAction({
    title: `${source.quarter} 내용 불러오기`,
    message: `${target.quarter}의 아래 항목을 ${source.quarter}에 저장된 내용으로 바꿉니다.\n\n행사 날짜, 접수 상태, 마감일, 신청 링크는 현재 값을 유지합니다. 불러온 뒤 저장해야 사이트에 반영됩니다.`,
    items: ["소개 문구·공지", "행사 시간·장소·정원", "참가비·입금 계좌·신청 방식", "진행 순서"],
    confirmLabel: "불러오기",
  })) return;
  if (currentEvent() !== target || !state.ready || elements.eventForm.dataset.busy === "true") return;

  try {
    collectEventForm();
    // Only reusable settings are copied; the target quarter and its reception dates stay intact.
    [
      "titleLineOne", "titleLineTwo", "description", "notice", "time", "venue", "locationNotice",
      "priceLabel", "capacity", "paymentAmount", "paymentAmounts", "bankName", "bankAccountHolder", "bankAccountNumber",
      "applicationCopy", "aboutIntro", "quote", "programDescription",
    ].forEach((field) => {
      if (source[field] !== undefined) target[field] = clone(source[field]);
      else delete target[field];
    });
    target.registrationMode = eventRegistrationMode(source);
    target.registrationProvider = source.registrationProvider || sourceConfig.registration?.provider || "onoffmix";
    target.agenda = clone(source.agenda || []);
    target.revision = Date.now();
    renderEventSelect();
    renderRegistrationEventSelect();
    markEventDirty();
    const message = `${source.quarter} 내용을 불러왔습니다. 날짜와 마감일을 확인한 뒤 저장해 주세요.`;
    $("#previous-event-import-status").textContent = message;
    showSyncStatus(message);
  } catch (error) {
    showSyncStatus(error?.message || "이전 분기 내용을 불러오지 못했습니다.", true);
  }
}

function collectAgendaRows() {
  return $$(".agenda-row", $("#agenda-editor")).map((row) => ({
    time: $("[data-agenda-field=time]", row).value.trim(),
    title: $("[data-agenda-field=title]", row).value.trim(),
    description: $("[data-agenda-field=description]", row).value.trim(),
  }));
}

function renderAgendaRows(agenda) {
  const editor = $("#agenda-editor");
  editor.replaceChildren();
  const items = Array.isArray(agenda) ? agenda : [];
  $("#agenda-empty").hidden = items.length > 0;
  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "agenda-row";
    [
      ["time", "시간", "19:00"],
      ["title", "내용", "자기소개"],
      ["description", "설명 (선택)", ""],
    ].forEach(([key, labelText, placeholder]) => {
      const label = document.createElement("label");
      label.className = `agenda-${key}`;
      const name = document.createElement("span");
      name.textContent = labelText;
      const input = document.createElement("input");
      input.dataset.agendaField = key;
      input.value = item[key] || "";
      input.placeholder = placeholder;
      input.required = key !== "description";
      input.setAttribute("aria-label", `${index + 1}번째 순서 ${labelText}`);
      if (key === "time") input.pattern = "([01][0-9]|2[0-3]):[0-5][0-9]|미정";
      label.append(name, input);
      row.append(label);
    });
    const actions = document.createElement("div");
    actions.className = "agenda-actions";
    [["up", "↑", "위로 이동"], ["down", "↓", "아래로 이동"], ["remove", "삭제", "삭제"]].forEach(([action, text, label]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-button";
      button.textContent = text;
      button.setAttribute("aria-label", `${index + 1}번째 순서 ${label}`);
      button.disabled = action === "up" && index === 0 || action === "down" && index === items.length - 1;
      button.addEventListener("click", () => {
        const rows = collectAgendaRows();
        if (action === "remove") rows.splice(index, 1);
        else {
          const destination = index + (action === "up" ? -1 : 1);
          [rows[index], rows[destination]] = [rows[destination], rows[index]];
        }
        renderAgendaRows(rows);
        markEventDirty();
      });
      actions.append(button);
    });
    row.append(actions);
    editor.append(row);
  });
}

function renderEventContext() {
  const event = state.savedEvents.find((item) => item.id === state.selectedEventId);
  const status = event ? effectiveStatus(event) : "draft";
  const badge = $("#context-status");
  const routeReady = event && (eventRegistrationMode(event) === "manual_transfer" ? bankTransferReady(event) : Boolean(event.registrationUrl));
  badge.textContent = !event ? "저장 전" : status === "closed" ? "접수 마감" : status === "open" && routeReady ? "접수 중" : "준비 중";
  badge.className = `status-badge ${status === "open" && routeReady ? "status-badge--confirmed" : status === "closed" ? "status-badge--refund" : ""}`;
  $("#context-detail").textContent = event ? [event.dateLabel, event.venue].filter(Boolean).join(" · ") : "새 행사 설정을 저장해 주세요.";
  $("#context-deadline").textContent = event ? `접수 마감: ${formatDeadline(event.registrationDeadline)}${event.registrationDeadline ? " (한국 시간)" : ""}` : "";
}

function renderEventDraft() {
  const form = elements.eventForm;
  let deadline = null;
  try { deadline = fromInputValue(value(form, "registrationDeadline")); } catch (_error) {}
  const draft = {
    ...currentEvent(), status: value(form, "status"), registrationDeadline: deadline,
    bankName: value(form, "bankName"), bankAccountHolder: value(form, "bankAccountHolder"),
    bankAccountNumber: value(form, "bankAccountNumber"), paymentAmounts: feesFromForm(),
    registrationMode: value(form, "registrationMode"), registrationUrl: value(form, "registrationUrl"),
  };
  const status = effectiveStatus(draft);
  const ready = eventRegistrationMode(draft) === "manual_transfer" ? bankTransferReady(draft) : Boolean(draft.registrationUrl);
  $("#draft-status").textContent = status === "closed" ? "접수 마감" : status === "open" && ready ? "접수 중" : "준비 중";
  $("#draft-deadline").textContent = deadline ? `${formatDeadline(deadline)} 자동 마감` : "자동 마감일 없음";
  $("#draft-route").textContent = status === "open" && !ready ? "입금 계좌와 참가비 또는 신청 링크를 확인해 주세요." : eventRegistrationMode(draft) === "manual_transfer" ? "계좌이체로 신청을 받습니다." : "외부 신청 페이지로 연결됩니다.";
  const preview = $("#deadline-preview");
  preview.textContent = deadline
    ? deadlinePassed(draft) ? "마감 시간이 지났습니다. 저장하면 신규 신청을 받지 않습니다." : `저장하면 ${formatDeadline(deadline)}에 자동으로 마감됩니다.`
    : "마감일을 비우면 ‘접수 상태’를 마감으로 바꿀 때까지 신청을 받습니다.";
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
    option.textContent = `${event.quarter} · ${effectiveStatus(event) === "closed" ? "마감" : event.statusLabel}${routeWarning}`;
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
    "refundDeadlineLabel", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => setValue(elements.eventForm, name, event[name]));
  setValue(elements.eventForm, "registrationMode", eventRegistrationMode(event));
  setValue(
    elements.eventForm,
    "registrationProvider",
    event.registrationProvider || sourceConfig.registration?.provider || "onoffmix",
  );
  setValue(elements.eventForm, "featured", event.featured);
  const amounts = feeAmounts(event);
  participantTypes.forEach((type) => setValue(elements.eventForm, `${type}PaymentAmount`, amounts[type] || ""));
  setValue(elements.eventForm, "registrationDeadline", toInputValue(event.registrationDeadline));
  elements.eventForm.elements.registrationDeadline.setCustomValidity(
    event.registrationDeadline && !Number.isFinite(deadlineMillis(event.registrationDeadline)) ? "접수 마감 날짜와 시간을 다시 설정해 주세요." : "",
  );
  renderAgendaRows(event.agenda);
  updateRegistrationModeFields();
  renderEventContext();
  renderEventDraft();
  renderPreviousEventImport();
  elements.eventLoadSummary.textContent = `${event.quarter}에 저장된 자료를 아래 입력칸에 불러왔습니다.`;
}

function updateRegistrationModeFields() {
  const mode = value(elements.eventForm, "registrationMode") || "external";
  $$('[data-registration-mode-fields]', elements.eventForm).forEach((section) => {
    section.hidden = section.dataset.registrationModeFields !== mode;
    $$('input, select, textarea', section).forEach((control) => { control.disabled = section.hidden; });
  });
}

function feesFromForm() {
  return Object.fromEntries(participantTypes.map((type) => [type, Number(value(elements.eventForm, `${type}PaymentAmount`))]));
}

function collectEventForm() {
  const event = currentEvent();
  if (!event) return;
  const previousId = event.id;
  const before = JSON.stringify(event);
  [
    "id", "quarter", "sequence", "status", "statusLabel", "titleLineOne", "titleLineTwo",
    "description", "notice", "dateLabel", "time", "venue", "locationNotice", "priceLabel",
    "registrationMode", "registrationProvider", "registrationUrl", "bankName", "bankAccountHolder",
    "bankAccountNumber", "refundDeadlineLabel", "applicationLabel", "applicationCopy", "aboutIntro", "quote", "programDescription",
  ].forEach((name) => {
    event[name] = value(elements.eventForm, name);
  });
  event.capacity = Number(elements.eventForm.elements.capacity.value) || 1;
  event.paymentAmounts = feesFromForm();
  event.paymentAmount = event.paymentAmounts.student === event.paymentAmounts.graduate ? event.paymentAmounts.student : 0;
  if (eventRegistrationMode(event) === "manual_transfer" && feesReady(event)) event.priceLabel = feeSummary(event);
  event.featured = elements.eventForm.elements.featured.checked;
  event.agenda = collectAgendaRows();
  event.registrationDeadline = fromInputValue(value(elements.eventForm, "registrationDeadline"));
  if (JSON.stringify(event) !== before) event.revision = Date.now();
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
    eyebrow: `${next.label} · 선후배 모임`,
    titleLineOne: "건국 컴공",
    titleLineTwo: "네트워킹",
    description: "건국대학교 컴퓨터공학과 선후배 모임입니다.",
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
    paymentAmounts: { student: 0, graduate: 0 },
    refundDeadlineLabel: "추후 공개",
    registrationDeadline: null,
    locationNotice: "정확한 장소는 신청·결제 완료자에게 운영자가 별도로 안내합니다.",
    applicationLabel: "오픈 예정",
    applicationCopy: "신청 시작일이 정해지면 이곳에서 안내하겠습니다.",
    aboutIntro: "자기소개, 선배 이야기, 자유 대화 순서로 진행합니다.",
    quote: "자세한 내용은 해당 회차의 일정을 확인해 주세요.",
    programDescription: "진행 순서는 일정이 정해진 뒤 공개하겠습니다.",
    agenda: [],
  };
  state.events.push(event);
  state.selectedEventId = event.id;
  state.selectedRegistrationEventId = event.id;
  renderEventSelect();
  renderRegistrationEventSelect();
  markEventDirty();
  showSyncStatus("새 회차를 만들었습니다. 내용을 확인한 뒤 저장해 주세요.");
}

async function deleteEvent() {
  if (state.events.length <= 1) {
    showSyncStatus("행사는 최소 한 회차가 있어야 합니다.", true);
    return;
  }
  const event = currentEvent();
  if (!event) return;
  if (sourceConfig.events.some((item) => item.id === event.id)) {
    showSyncStatus("기본 등록된 회차는 삭제할 수 없습니다. 접수를 멈추려면 상태를 ‘마감’으로 저장해 주세요.", true);
    return;
  }
  if (!await loadRegistrationData()) return;
  if (state.registrations.some((registration) => registration.eventId === event.id)) {
    showSyncStatus("신청자가 있는 행사는 삭제할 수 없습니다. 접수를 멈추려면 상태를 ‘마감’으로 바꿔 저장해 주세요.", true);
    return;
  }
  if (!await confirmAction({ title: "행사 삭제", message: `${event.quarter}을 목록에서 삭제할까요? 변경 사항을 저장해야 사이트에 반영됩니다.`, confirmLabel: "삭제", danger: true })) return;
  state.events = state.events.filter((item) => item !== event);
  state.selectedEventId = state.events[0].id;
  state.selectedRegistrationEventId = state.selectedEventId;
  renderEventSelect();
  renderRegistrationEventSelect();
  markEventDirty();
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
    const deadline = deadlineMillis(event.registrationDeadline);
    if (deadline !== null && !Number.isFinite(deadline)) throw new Error(`${event.quarter} 접수 마감 날짜와 시간을 확인해 주세요.`);
    if ((event.agenda || []).some((item) => !item.time || !item.title || !/^(?:([01]\d|2[0-3]):[0-5]\d|미정)$/.test(item.time))) {
      throw new Error(`${event.quarter} 진행 순서의 시간과 내용을 확인해 주세요.`);
    }
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
      const amounts = hasSeparateFees(event) ? event.paymentAmounts : { student: event.paymentAmount || 0, graduate: event.paymentAmount || 0 };
      for (const type of participantTypes) {
        if (!amounts || (amounts[type] !== 0 && !validFee(amounts[type]))) {
          throw new Error(`${event.quarter} ${participantLabel(type)} 참가비를 확인해 주세요.`);
        }
      }
      if (event.status === "open" && !bankTransferReady(event)) {
        throw new Error(`${event.quarter} 은행·예금주·계좌번호와 재학생·졸업생 참가비를 모두 입력해야 신청을 열 수 있습니다.`);
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
  if (elements.eventForm.dataset.busy === "true" || !validateFormControls(elements.eventForm)) return;
  try {
    collectEventForm();
    validateEvents();
    setBusy(elements.eventForm, true);
    updateDirtyStatus();
    await writeEventsAndGates(state.events);
    state.savedEvents = clone(state.events);
    state.eventsDirty = false;
    renderEventSelect();
    renderRegistrationEventSelect();
    const saved = currentEvent();
    showSyncStatus(`${saved?.quarter || "행사"} 설정을 저장했습니다. 사이트에 반영되었습니다.`);
  } catch (error) {
    showSyncStatus(error?.message || "행사 내용을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.eventForm, false);
    updateDirtyStatus();
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
    timeZone: "Asia/Seoul",
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

function appendTextCell(row, text, label) {
  const cell = document.createElement("td");
  cell.textContent = text;
  cell.dataset.label = label;
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
    complete.textContent = "환불 송금 완료";

    const unpaid = document.createElement("button");
    unpaid.type = "button";
    unpaid.className = "admin-button";
    unpaid.dataset.refundAction = "unpaid";
    unpaid.dataset.registrationId = registration.id;
    unpaid.textContent = "미입금 취소";
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

function isPending(registration) {
  return registration.status === "payment_reported" && state.refunds.get(registration.id)?.status !== "refund_requested";
}

function updateSelection() {
  const available = $$('[data-registration-select]:not(:disabled)', elements.registrationRows);
  const selected = available.filter((checkbox) => checkbox.checked);
  $("#selection-count").textContent = `선택 ${selected.length}건`;
  $("#confirm-selected").disabled = !selected.length || state.registrationSaving || state.registrationLoading;
  const all = $("#select-all-registrations");
  all.disabled = !available.length || state.registrationSaving || state.registrationLoading;
  all.checked = available.length > 0 && selected.length === available.length;
  all.indeterminate = selected.length > 0 && selected.length < available.length;
}

function renderRegistrationRows() {
  const all = selectedEventRegistrations();
  const search = $("#registration-search").value.trim().toLowerCase().replace(/[\s-]/g, "");
  const registrations = all.filter((registration) => {
    const matchesStatus = state.registrationFilter === "all"
      || state.registrationFilter === "pending" && isPending(registration)
      || state.registrationFilter === "confirmed" && registration.status === "confirmed"
      || state.registrationFilter === "refund_requested" && state.refunds.get(registration.id)?.status === "refund_requested";
    const fields = [registration.name, participantLabel(registration.participantType), registration.depositorName, registration.phone, registration.phoneDigits, registration.id];
    return matchesStatus && (!search || fields.some((field) => String(field || "").toLowerCase().replace(/[\s-]/g, "").includes(search)));
  });
  $$('[data-registration-filter]').forEach((button) => {
    const active = button.dataset.registrationFilter === state.registrationFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#clear-registration-filters").hidden = !search && state.registrationFilter === "all";
  elements.registrationRows.replaceChildren();
  elements.registrationEmpty.hidden = registrations.length > 0;
  elements.registrationEmpty.textContent = all.length ? "조건에 맞는 신청자가 없습니다." : "아직 접수된 신청이 없습니다.";
  elements.registrationRows.closest(".registration-table-wrap").hidden = registrations.length === 0;

  registrations.forEach((registration) => {
    const row = document.createElement("tr");
    row.dataset.registrationId = registration.id;

    const selectCell = document.createElement("td");
    selectCell.dataset.label = "입금 확인 선택";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.registrationSelect = registration.id;
    checkbox.setAttribute("aria-label", `${registration.name} 입금확정 선택`);
    checkbox.disabled = !isPending(registration) || state.registrationSaving;
    checkbox.addEventListener("change", () => { row.classList.toggle("is-matched", checkbox.checked); updateSelection(); });
    const selectLabel = document.createElement("label");
    selectLabel.className = "select-checkbox";
    selectLabel.append(checkbox);
    selectCell.append(selectLabel);
    row.append(selectCell);

    appendTextCell(row, formatRegistrationTime(registration), "신청 시각");

    const personCell = document.createElement("td");
    personCell.dataset.label = "신청자";
    const person = document.createElement("div");
    person.className = "registration-person";
    const name = document.createElement("strong");
    name.textContent = registration.name || "—";
    const phone = document.createElement("small");
    phone.textContent = registration.phone || registration.phoneDigits || "—";
    const participant = document.createElement("small");
    participant.textContent = participantLabel(registration.participantType) || "구분 미수집";
    participant.dataset.participantType = registration.participantType || "";
    const code = document.createElement("details");
    const codeLabel = document.createElement("summary");
    codeLabel.textContent = "신청번호";
    const codeValue = document.createElement("small");
    codeValue.textContent = registration.id;
    code.append(codeLabel, codeValue);
    person.append(name, participant, phone, code);
    personCell.append(person);
    row.append(personCell);

    appendTextCell(row, registration.depositorName || "—", "입금자명");
    appendTextCell(row, formatAmount(registration.amount), "금액");

    const statusCell = document.createElement("td");
    statusCell.dataset.label = "상태";
    const status = document.createElement("span");
    status.className = statusBadgeClass(registration.status);
    status.textContent = registrationStatusLabel(registration.status);
    statusCell.append(status);
    row.append(statusCell);

    const refundCell = document.createElement("td");
    refundCell.dataset.label = "환불";
    renderRefundCell(refundCell, registration);
    row.append(refundCell);
    elements.registrationRows.append(row);
  });

  const activeRefunds = all.filter(
    (registration) => state.refunds.get(registration.id)?.status === "refund_requested",
  ).length;
  $("#stat-total").textContent = String(all.length);
  $("#stat-pending").textContent = String(all.filter(isPending).length);
  $("#stat-confirmed").textContent = String(all.filter((item) => item.status === "confirmed").length);
  $("#stat-refunds").textContent = String(activeRefunds);
  const event = state.savedEvents.find((item) => item.id === state.selectedRegistrationEventId);
  $("#stat-capacity").textContent = `정원 ${event?.capacity || currentEvent()?.capacity || "—"}명`;
  if (!state.registrationLoading) $("#registration-load-status").textContent = `전체 ${all.length}명 · 현재 목록 ${registrations.length}명`;
  updateSelection();
}

async function loadRegistrationData() {
  if (state.registrationLoading) return false;
  state.registrationLoading = true;
  $("#refresh-registrations").disabled = true;
  $("#registration-load-status").textContent = "신청자를 불러오는 중입니다.";
  updateSelection();
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
    state.registrationLoading = false;
    renderRegistrationRows();
    return true;
  } catch (_error) {
    $("#registration-load-status").textContent = "신청자를 불러오지 못했습니다. 새로고침을 눌러 다시 확인해 주세요.";
    return false;
  } finally {
    state.registrationLoading = false;
    $("#refresh-registrations").disabled = state.registrationSaving;
    updateSelection();
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
  if (state.registrationSaving || state.registrationLoading) return;
  state.registrationFilter = "pending";
  $("#registration-search").value = "";
  renderRegistrationRows();
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
  updateSelection();
}

async function confirmSelectedRegistrations() {
  if (state.registrationSaving || state.registrationLoading) return;
  const ids = $$('[data-registration-select]:checked:not(:disabled)', elements.registrationRows).map(
    (checkbox) => checkbox.dataset.registrationSelect,
  );
  if (ids.length === 0) {
    elements.matchStatus.textContent = "입금확정할 신청을 먼저 선택해 주세요.";
    elements.matchStatus.classList.add("is-error");
    return;
  }

  const event = state.savedEvents.find((item) => item.id === state.selectedRegistrationEventId);
  const confirmedCount = selectedEventRegistrations().filter((item) => item.status === "confirmed").length;
  if (event && confirmedCount + ids.length > Number(event.capacity || 0)) {
    elements.matchStatus.textContent = "선택 건을 확정하면 정원을 넘습니다. 신청 상태와 정원을 먼저 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
    return;
  }
  if (!await confirmAction({ title: `${ids.length}명 입금 확인`, message: "은행 내역에서 아래 입금자명과 금액을 확인했으면 참여를 확정하세요.", confirmLabel: "입금 확인·참여 확정", items: ids.map((id) => {
    const item = state.registrations.find((registration) => registration.id === id);
    return `${item.name} · 입금자 ${item.depositorName} · ${formatAmount(item.amount)}`;
  }) })) return;
  state.registrationSaving = true;
  renderRegistrationRows();
  try {
    await runTransaction(db, async (transaction) => {
      const snapshots = await Promise.all(ids.map(async (id) => ({
        registration: await transaction.get(doc(db, "registrations", id)),
        refund: await transaction.get(doc(db, "refundRequests", id)),
      })));
      if (snapshots.some(({ registration, refund }) => registration.data()?.status !== "payment_reported" || refund.data()?.status === "refund_requested")) {
        throw new Error("선택한 신청의 상태가 바뀌었습니다. 명단을 새로고침한 뒤 다시 확인해 주세요.");
      }
      snapshots.forEach(({ registration }) => {
        transaction.update(registration.ref, { status: "confirmed", confirmedAt: serverTimestamp(), confirmedBy: runtime.adminUsername });
      });
    });
    elements.bankTransactions.value = "";
    await loadRegistrationData();
    elements.matchStatus.classList.remove("is-error");
    elements.matchStatus.textContent = `${ids.length}건을 참여 확정으로 기록했습니다.`;
  } catch (error) {
    elements.matchStatus.textContent = error?.message || "입금 확인을 저장하지 못했습니다. 새로고침 후 다시 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
  } finally {
    state.registrationSaving = false;
    $("#refresh-registrations").disabled = false;
    renderRegistrationRows();
  }
}

async function resolveRefund(registrationId, outcome) {
  if (state.registrationSaving || state.registrationLoading) return;
  const registration = state.registrations.find((item) => item.id === registrationId);
  const refund = state.refunds.get(registrationId);
  if (!registration || !refund || refund.status !== "refund_requested") return;

  const completed = outcome === "complete";
  const prompt = completed
    ? `${registration.name}님에게 ${refund.refundBank} ${refund.refundAccount} 계좌로 실제 환불 송금을 완료했나요?`
    : `${registration.name}님의 실제 입금이 없음을 은행 내역에서 확인했나요? 환불 없이 신청을 취소합니다.`;
  if (!await confirmAction({ title: completed ? "환불 완료 기록" : "미입금 취소", message: prompt, confirmLabel: completed ? "송금 완료·기록 저장" : "미입금 취소", danger: !completed })) return;
  state.registrationSaving = true;
  try {
    await runTransaction(db, async (transaction) => {
      const registrationRef = doc(db, "registrations", registrationId);
      const refundRef = doc(db, "refundRequests", registrationId);
      const [latestRegistration, latestRefund] = await Promise.all([transaction.get(registrationRef), transaction.get(refundRef)]);
      if (!latestRegistration.exists() || latestRefund.data()?.status !== "refund_requested" || latestRefund.data()?.refundAccount !== refund.refundAccount) {
        throw new Error("환불 요청이 변경되었습니다. 명단을 새로고침한 뒤 다시 확인해 주세요.");
      }
      transaction.update(registrationRef, {
      status: completed ? "refund_completed" : "canceled_unpaid",
      refundedAt: serverTimestamp(),
      refundedBy: runtime.adminUsername,
    });
      transaction.update(refundRef, {
      status: completed ? "refunded" : "resolved_unpaid",
      refundAccountLast4: String(refund.refundAccount || "").slice(-4),
      refundBank: deleteField(),
      refundAccount: deleteField(),
      refundAccountHolder: deleteField(),
      resolvedAt: serverTimestamp(),
      resolvedBy: runtime.adminUsername,
    });
      });
    await loadRegistrationData();
    elements.matchStatus.textContent = completed
      ? "환불 완료를 기록하고 환불 계좌정보를 파기했습니다."
      : "미입금 취소를 기록하고 환불 계좌정보를 파기했습니다.";
  } catch (error) {
    elements.matchStatus.textContent = error?.message || "환불 처리 상태를 저장하지 못했습니다. 실제 송금 여부를 다시 확인해 주세요.";
    elements.matchStatus.classList.add("is-error");
  } finally {
    state.registrationSaving = false;
    $("#refresh-registrations").disabled = false;
    renderRegistrationRows();
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
  $$('input, textarea', elements.historyForm).forEach((control) => { control.disabled = !event; if (!event) control.value = ""; });
  $("#delete-history").disabled = !event;
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
  markHistoryDirty();
  showSyncStatus("새 기록을 만들었습니다. 공개할 내용만 적어 주세요.");
}

async function deleteHistory() {
  const event = currentHistory();
  if (!event || !await confirmAction({ title: "지난 모임 기록 삭제", message: `${event.title} 기록을 삭제할까요? 기록을 저장하면 사이트에 반영됩니다.`, confirmLabel: "삭제", danger: true })) return;
  state.history.events = state.history.events.filter((item) => item !== event);
  state.selectedHistoryId = state.history.events[0]?.id || "";
  renderHistorySelect();
  markHistoryDirty();
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
  if (elements.historyForm.dataset.busy === "true" || !validateFormControls(elements.historyForm)) return;
  try {
    collectHistoryForm();
    validatePublicHistory();
    state.history.events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    setBusy(elements.historyForm, true);
    updateDirtyStatus();
    await writePayload("history", state.history);
    state.savedHistory = clone(state.history);
    state.historyDirty = false;
    renderHistorySelect();
    showSyncStatus("지난 기록을 저장했습니다.");
  } catch (error) {
    showSyncStatus(error?.message || "지난 기록을 저장하지 못했습니다.", true);
  } finally {
    setBusy(elements.historyForm, false);
    updateDirtyStatus();
  }
}

function switchTab(name) {
  $$('[data-admin-tab]').forEach((button) => {
    const active = button.dataset.adminTab === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
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
  state.eventsDirty = false;
  state.historyDirty = false;
  state.remotePayloads = { events: null, history: null };
  elements.eventForm.reset();
  elements.historyForm.reset();
  $("#agenda-editor").replaceChildren();
  elements.registrationRows.replaceChildren();
  elements.bankTransactions.value = "";
  elements.dashboard.hidden = true;
  elements.loginPanel.hidden = false;
}

function markHistoryDirty() {
  if (!state.ready) return;
  state.historyDirty = true;
  updateDirtyStatus();
}

async function discardPermission(message) {
  return !(state.eventsDirty || state.historyDirty) || confirmAction({ title: "저장하지 않은 내용이 있습니다", message, confirmLabel: "변경 내용 버리기", danger: true });
}

async function reloadDashboard() {
  if (!await discardPermission("저장하지 않은 내용을 버리고 최신 설정을 불러올까요?")) return;
  state.ready = false;
  setBusy(elements.eventForm, true);
  setBusy(elements.historyForm, true);
  try { await loadDashboardData(); }
  catch (_error) { showSyncStatus("설정을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.", true); }
  finally { setBusy(elements.eventForm, false); setBusy(elements.historyForm, false); updateDirtyStatus(); }
}

elements.loginForm.addEventListener("submit", login);
$("#logout-button").addEventListener("click", async () => {
  if (await discardPermission("저장하지 않은 내용을 버리고 로그아웃할까요?")) await signOut(auth);
});
$("#toggle-password").addEventListener("click", () => {
  const input = elements.loginForm.elements.password;
  input.type = input.type === "password" ? "text" : "password";
  $("#toggle-password").textContent = input.type === "text" ? "숨기기" : "보기";
  $("#toggle-password").setAttribute("aria-pressed", String(input.type === "text"));
});
$("#action-dialog").addEventListener("close", () => {
  const resolve = state.actionResolver;
  state.actionResolver = null;
  resolve?.($("#action-dialog").returnValue === "confirm");
});
elements.eventSelect.addEventListener("change", () => {
  try { collectEventForm(); }
  catch (error) { elements.eventSelect.value = state.selectedEventId; showSyncStatus(error.message, true); return; }
  state.selectedEventId = elements.eventSelect.value;
  state.selectedRegistrationEventId = state.selectedEventId;
  elements.bankTransactions.value = "";
  elements.matchStatus.textContent = "";
  $("#registration-search").value = "";
  renderEventForm();
  renderRegistrationEventSelect();
});
elements.historySelect.addEventListener("change", () => {
  collectHistoryForm();
  state.selectedHistoryId = elements.historySelect.value;
  renderHistoryForm();
});
elements.eventForm.addEventListener("submit", saveEvents);
elements.eventForm.addEventListener("input", (event) => {
  if (event.target.name === "registrationDeadline") event.target.setCustomValidity("");
  if (participantTypes.some((type) => event.target.name === `${type}PaymentAmount`)) {
    const summary = feeSummary({ paymentAmounts: feesFromForm() });
    if (summary) setValue(elements.eventForm, "priceLabel", summary);
  }
  markEventDirty();
});
elements.eventForm.addEventListener("change", (event) => {
  if (event.target.name === "registrationMode") updateRegistrationModeFields();
  if (event.target.name === "status") {
    const status = event.target.value;
    setValue(elements.eventForm, "statusLabel", { open: "신청 중", closed: "마감", upcoming: "예정" }[status]);
    setValue(elements.eventForm, "applicationLabel", { open: "참여 신청", closed: "접수 마감", upcoming: "신청 준비 중" }[status]);
  }
  markEventDirty();
});
$("#add-agenda").addEventListener("click", () => {
  renderAgendaRows([...collectAgendaRows(), { time: "", title: "", description: "" }]);
  markEventDirty();
  $(".agenda-row:last-child input", $("#agenda-editor")).focus();
});
$("#import-previous-event").addEventListener("click", importPreviousEvent);
$("#discard-event-changes").addEventListener("click", async () => {
  if (!await confirmAction({ title: "행사 변경 취소", message: "저장하지 않은 행사 설정을 모두 버릴까요?", confirmLabel: "변경 내용 버리기", danger: true })) return;
  state.events = clone(state.savedEvents);
  if (!state.events.some((event) => event.id === state.selectedEventId)) state.selectedEventId = initialEventId(state.events);
  state.selectedRegistrationEventId = state.selectedEventId;
  state.eventsDirty = false;
  renderEventSelect();
  renderRegistrationEventSelect();
  updateDirtyStatus();
  showSyncStatus("저장된 행사 설정으로 되돌렸습니다.");
});
$("#reload-dashboard").addEventListener("click", reloadDashboard);
elements.historyForm.addEventListener("submit", saveHistory);
elements.historyForm.addEventListener("input", markHistoryDirty);
elements.historyForm.addEventListener("change", markHistoryDirty);
$("#registration-search").addEventListener("input", renderRegistrationRows);
$$('[data-registration-filter]').forEach((button) => button.addEventListener("click", () => { state.registrationFilter = button.dataset.registrationFilter; renderRegistrationRows(); }));
$$('[data-stat-filter]').forEach((button) => button.addEventListener("click", () => { state.registrationFilter = button.dataset.statFilter; $("#registration-search").value = ""; switchTab("registrations"); renderRegistrationRows(); $("#tab-registrations").scrollIntoView({ block: "start", behavior: "smooth" }); }));
$("#clear-registration-filters").addEventListener("click", () => { state.registrationFilter = "all"; $("#registration-search").value = ""; renderRegistrationRows(); });
$("#select-all-registrations").addEventListener("change", (event) => {
  $$('[data-registration-select]:not(:disabled)', elements.registrationRows).forEach((checkbox) => { checkbox.checked = event.target.checked; checkbox.closest("tr").classList.toggle("is-matched", checkbox.checked); });
  updateSelection();
});
$("#refresh-registrations").addEventListener("click", async () => {
  if (await loadRegistrationData()) { elements.matchStatus.classList.remove("is-error"); elements.matchStatus.textContent = "신청자 명단을 새로 불러왔습니다."; }
});
$("#match-transactions").addEventListener("click", matchTransactions);
$("#confirm-selected").addEventListener("click", confirmSelectedRegistrations);
elements.registrationRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-refund-action]");
  if (!button) return;
  resolveRefund(button.dataset.registrationId, button.dataset.refundAction);
});
$("#add-event").addEventListener("click", addEvent);
$("#delete-event").addEventListener("click", deleteEvent);
$("#add-history").addEventListener("click", addHistory);
$("#delete-history").addEventListener("click", deleteHistory);
$$('[data-admin-tab]').forEach((button, index, tabs) => {
  button.addEventListener("click", () => switchTab(button.dataset.adminTab));
  button.addEventListener("keydown", (event) => {
    const destination = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    switchTab(tabs[destination].dataset.adminTab);
    tabs[destination].focus();
  });
});
window.addEventListener("beforeunload", (event) => {
  if (state.eventsDirty || state.historyDirty) { event.preventDefault(); event.returnValue = ""; }
});
setInterval(() => { if (state.ready) { renderEventContext(); renderEventDraft(); } }, 15000);

onAuthStateChanged(auth, (user) => {
  if (user) showDashboard(user);
  else showLogin();
});
