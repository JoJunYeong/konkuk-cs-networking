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

  function countdown(event, now = Date.now()) {
    const deadline = deadlineMillis(event?.registrationDeadline);
    if (effectiveStatus(event, now) === "closed") {
      return { badge: "접수 마감", remaining: "신청 접수가 종료되었습니다", tone: "closed" };
    }
    if (deadline === null || !Number.isFinite(deadline) || event?.status !== "open") {
      return { badge: event?.status === "open" ? "접수 중" : "오픈 예정", remaining: "접수 일정을 확인해 주세요", tone: "neutral" };
    }
    // D-day는 접속 기기의 시간대와 무관하게 한국 달력의 날짜 차이로 계산합니다.
    const day = 86400000;
    const koreaOffset = 9 * 3600000;
    const days = Math.floor((deadline + koreaOffset) / day) - Math.floor((now + koreaOffset) / day);
    const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
    const parts = [
      Math.floor(seconds / 86400) ? `${Math.floor(seconds / 86400)}일` : "",
      `${Math.floor(seconds / 3600) % 24}시간`,
      `${Math.floor(seconds / 60) % 60}분`,
      `${seconds % 60}초`,
    ].filter(Boolean);
    return { badge: days === 0 ? "D-DAY" : `D-${days}`, remaining: `${parts.join(" ")} 남음`, tone: days <= 1 ? "urgent" : "open" };
  }

  window.KURegistrationTime = Object.freeze({ deadlineMillis, deadlinePassed, effectiveStatus, toInputValue, fromInputValue, formatDeadline, countdown });
})();
