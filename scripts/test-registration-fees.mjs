import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL("../assets/registration-fees.js", import.meta.url), "utf8"), context);
const fees = context.window.KURegistrationFees;
const legacy = { paymentAmount: 10000 };
const separate = { paymentAmount: 10000, paymentAmounts: { student: 8000, graduate: 20000 } };

for (const type of ["student", "graduate"]) assert.equal(fees.participantAmount(legacy, type), 10000);
assert.equal(fees.participantAmount(separate, "student"), 8000);
assert.equal(fees.participantAmount(separate, "graduate"), 20000);
assert.equal(fees.feeSummary(separate), "재학생 8,000원 · 졸업생 20,000원");
assert.equal(fees.feeSummary(legacy), "10,000원");
for (const type of ["", "other", "__proto__", "constructor", null]) assert.equal(fees.participantAmount(separate, type), 0);
for (const schedule of [null, {}, { student: 8000 }, { student: 0, graduate: 20000 }, { student: "8000", graduate: 20000 }]) {
  const malformed = { paymentAmount: 10000, paymentAmounts: schedule };
  assert.equal(fees.feesReady(malformed), false);
  assert.equal(fees.participantAmount(malformed, "student"), 0);
}
for (const amount of [-1, 0, 1.5, 1000001, NaN, Infinity, "10000", true]) assert.equal(fees.validFee(amount), false);
assert.equal(fees.validFee(1), true);
assert.equal(fees.validFee(1000000), true);
assert.equal(fees.feeSummary({ paymentAmount: 0 }), "");
assert.equal(fees.participantLabel("graduate"), "졸업생");
console.log("PASS participant fees: both categories, legacy prices, malformed schedules, invalid categories and amount limits");
