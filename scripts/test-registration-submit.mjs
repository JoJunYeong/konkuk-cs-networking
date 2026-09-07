import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../assets/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const registrationId = "a".repeat(32);

function functionSource(name) {
  const pattern = new RegExp(`^  (?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^  \\}`, "m");
  const match = source.match(pattern);
  assert.ok(match, `Missing ${name} function`);
  return match[0];
}

function harness(options = {}) {
  const values = {
    name: "신청테스트",
    phone: "01000000000",
    participantType: options.participantType || "graduate",
    depositorName: "신청테스트",
    privacyConsent: "on",
    ...(options.company === undefined ? {} : { company: options.company }),
  };
  const calls = { saves: [], resets: 0, receipts: [], status: "" };
  const attributes = new Map();
  const controls = [{ disabled: false }, { disabled: false }];
  const quarterButtons = [{ disabled: false }];
  const form = {
    values,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    reset() {
      calls.resets += 1;
      for (const name of Object.keys(values)) values[name] = "";
    },
  };
  const state = {
    event: { id: "2026-Q3", status: options.closed ? "closed" : "open" },
    registrationStep: "info",
    submitting: false,
  };
  const context = {
    state,
    config: { form: { fields: ["name", "phone", "participantType", "depositorName"].map(name => ({ name })) } },
    elements: { form, quarterTabs: {}, submit: { textContent: "" } },
    FormData: class {
      constructor(currentForm) { this.values = currentForm.values; }
      get(name) { return this.values[name] ?? null; }
    },
    $$: (_selector, root) => root === form ? controls : quarterButtons,
    clone: structuredClone,
    hideStatus: () => { calls.status = ""; },
    showStatus: message => { calls.status = message; },
    effectiveStatus: event => event.status,
    registrationMode: () => "manual_transfer",
    validateForm: () => options.valid !== false,
    bankTransferReady: () => options.bankReady !== false,
    setRegistrationStep: step => { state.registrationStep = step; },
    valueFromForm: (currentForm, name) => String(currentForm.values[name] || "").trim(),
    rememberedRegistration: () => options.recent ? { registrationId } : null,
    submittedRecently: () => Boolean(options.recent),
    async createManualTransferRegistration(payload, selectedEvent) {
      calls.saves.push(structuredClone({ payload, selectedEvent }));
      if (options.saveResult) await options.saveResult;
      if (options.failSave) throw new Error("save_failed");
      return registrationId;
    },
    showManualTransferResult: (payload, receiptId) => { calls.result = { payload, receiptId }; },
    renderReceipt: receiptId => calls.receipts.push(receiptId),
    deadlinePassed: () => false,
    submitLabelForMode: () => "입금완료 · 참여신청 마무리",
    updateEventContent: () => {},
  };
  vm.runInNewContext(`${functionSource("formPayload")}\n${functionSource("handleSubmit")}`, context);
  return {
    calls, state, values, controls, quarterButtons, attributes,
    submit: () => context.handleSubmit({ preventDefault() {} }),
  };
}

for (const participantType of ["student", "graduate"]) {
  for (const company of [undefined, "", "자동완성 회사"]) {
    const current = harness({ participantType, company });
    await current.submit();
    assert.equal(current.state.registrationStep, "payment");
    assert.equal(current.calls.saves.length, 0, "Information step must not submit");
    await current.submit();
    assert.equal(current.calls.saves.length, 1, `Autofilled company must not block ${participantType}`);
    const payload = current.calls.saves[0].payload;
    assert.equal(payload.fields.name, payload.fields.depositorName);
    assert.equal(payload.fields.participantType, participantType);
    assert.equal(payload.consents.privacy, true);
    assert.equal(payload.consents.paymentReported, true);
    assert.equal(Object.hasOwn(payload.fields, "company"), false);
    assert.equal(current.calls.resets, 1);
    assert.deepEqual(current.calls.receipts, [registrationId]);
    assert.equal(current.calls.status, "");
    assert.equal(current.state.submitting, false);
  }
}

for (const options of [{ valid: false }, { bankReady: false }, { closed: true }, { recent: true }]) {
  const current = harness(options);
  await current.submit();
  await current.submit();
  assert.equal(current.calls.saves.length, 0);
  assert.equal(current.calls.resets, 0);
}

const failed = harness({ company: "자동완성 회사", failSave: true });
await failed.submit();
await failed.submit();
assert.equal(failed.calls.saves.length, 1);
assert.equal(failed.calls.resets, 0);
assert.equal(failed.values.name, "신청테스트");
assert.equal(failed.values.phone, "01000000000");
assert.match(failed.calls.status, /다시 입금하지 말고/);
assert.equal(failed.state.submitting, false);
assert.equal(failed.attributes.has("aria-busy"), false);
assert.ok([...failed.controls, ...failed.quarterButtons].every(control => !control.disabled));

let finishSave;
const saving = harness({ saveResult: new Promise(resolve => { finishSave = resolve; }) });
await saving.submit();
const pending = saving.submit();
assert.equal(saving.state.submitting, true);
assert.ok([...saving.controls, ...saving.quarterButtons].every(control => control.disabled));
await saving.submit();
assert.equal(saving.calls.saves.length, 1);
finishSave();
await pending;
assert.equal(saving.calls.saves.length, 1);
assert.equal(saving.state.submitting, false);
assert.ok([...saving.controls, ...saving.quarterButtons].every(control => !control.disabled));

assert.doesNotMatch(html, /<input\b[^>]*\bname=["']company["']/);
console.log("PASS submission: both participant types, matching depositor names, legacy autofill, validation gates, save failure and double submit");
