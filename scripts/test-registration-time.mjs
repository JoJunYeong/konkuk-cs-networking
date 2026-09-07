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

const q3 = { status: "open", registrationDeadline: "2026-09-14T14:59:00.000Z" };
assert.equal(time.countdown(q3, Date.parse("2026-09-07T23:59:59+09:00")).badge, "D-7");
assert.equal(time.countdown(q3, Date.parse("2026-09-08T00:00:00+09:00")).badge, "D-6");
assert.equal(time.countdown(q3, Date.parse("2026-09-14T00:00:00+09:00")).badge, "D-DAY");
assert.equal(time.countdown(q3, Date.parse("2026-09-14T23:58:59+09:00")).remaining, "0시간 0분 1초 남음");
assert.equal(time.countdown(q3, Date.parse(q3.registrationDeadline)).badge, "접수 마감");
assert.equal(time.countdown(q3, Date.parse(q3.registrationDeadline) + 1000).tone, "closed");
assert.equal(time.countdown({ ...q3, status: "closed" }, boundary).badge, "접수 마감");
assert.equal(time.countdown({ ...q3, status: "upcoming" }, boundary).badge, "오픈 예정");
assert.equal(time.countdown({ status: "open" }, boundary).badge, "접수 중");
assert.equal(time.countdown({ status: "open", registrationDeadline: "bad" }, boundary).badge, "접수 마감");
console.log("PASS registration deadline boundary, invalid data, and Korea time conversion");
console.log("PASS D-day Korea midnight, final second, automatic closing, and event status");
