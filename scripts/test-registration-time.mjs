import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL("../assets/registration-time.js", import.meta.url), "utf8"), context);
const time = context.window.KURegistrationTime;
const deadline = "2026-09-07T14:59:00.000Z";
const event = { status: "open", registrationDeadline: deadline };
const boundary = Date.parse(deadline);

assert.equal(time.fromInputValue("2026-09-07T23:59"), deadline);
assert.equal(time.toInputValue(deadline), "2026-09-07T23:59");
assert.equal(time.formatDeadline(deadline), "2026.09.07 23:59");
assert.equal(time.effectiveStatus(event, boundary - 1), "open");
assert.equal(time.effectiveStatus(event, boundary), "closed");
assert.equal(time.effectiveStatus(event, boundary + 1), "closed");
assert.equal(time.effectiveStatus({ ...event, status: "closed" }, boundary - 1), "closed");
assert.equal(time.effectiveStatus({ status: "open", registrationDeadline: null }, boundary), "open");
assert.equal(time.effectiveStatus({ status: "open", registrationDeadline: "invalid" }, boundary), "closed");
assert.equal(time.effectiveStatus({ status: "open", registrationDeadline: "2026-09-07T23:59" }, boundary), "closed");
assert.equal(time.fromInputValue(""), null);
assert.throws(() => time.fromInputValue("2026-02-30T12:00"));
assert.throws(() => time.fromInputValue("2026-09-07T24:00"));
console.log("PASS registration deadline boundary, invalid data, and Korea time conversion");
