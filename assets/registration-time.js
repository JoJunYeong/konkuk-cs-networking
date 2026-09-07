(() => {
  "use strict";

  function deadlineMillis(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    return Date.parse(value);
  }

  function deadlinePassed(event, now = Date.now()) {
    const deadline = deadlineMillis(event?.registrationDeadline);
    return deadline !== null && (!Number.isFinite(deadline) || now >= deadline);
  }

  function effectiveStatus(event, now = Date.now()) {
    return event?.status === "open" && deadlinePassed(event, now) ? "closed" : event?.status || "upcoming";
  }

  function toInputValue(value) {
    const deadline = deadlineMillis(value);
    return deadline !== null && Number.isFinite(deadline)
      ? new Date(deadline + 9 * 60 * 60 * 1000).toISOString().slice(0, 16)
      : "";
  }

  function fromInputValue(value) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("접수 마감 날짜와 시간을 확인해 주세요.");
    const date = new Date(`${value}:00+09:00`);
    if (!Number.isFinite(date.getTime()) || toInputValue(date.toISOString()) !== value) {
      throw new Error("접수 마감 날짜와 시간을 확인해 주세요.");
    }
    return date.toISOString();
  }

  function formatDeadline(value) {
    const input = toInputValue(value);
    return input ? input.replaceAll("-", ".").replace("T", " ") : "마감일 없음";
  }

  window.KURegistrationTime = Object.freeze({ deadlineMillis, deadlinePassed, effectiveStatus, toInputValue, fromInputValue, formatDeadline });
})();
