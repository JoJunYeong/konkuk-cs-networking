(() => {
  "use strict";

  const participantTypes = Object.freeze(["student", "graduate"]);
  const labels = Object.freeze({ student: "재학생", graduate: "졸업생" });
  const validFee = (amount) => Number.isInteger(amount) && amount > 0 && amount <= 1_000_000;
  const participantLabel = (type) => participantTypes.includes(type) ? labels[type] : "";
  const hasSeparateFees = (event) => Object.prototype.hasOwnProperty.call(event || {}, "paymentAmounts");

  function feeAmounts(event) {
    // A malformed new schedule must not silently fall back to an older fee.
    const values = hasSeparateFees(event)
      ? event.paymentAmounts
      : { student: event?.paymentAmount, graduate: event?.paymentAmount };
    return Object.fromEntries(participantTypes.map((type) => [type, validFee(values?.[type]) ? values[type] : 0]));
  }

  function feesReady(event) {
    const fees = feeAmounts(event);
    return participantTypes.every((type) => validFee(fees[type]));
  }

  function participantAmount(event, type) {
    return participantLabel(type) && feesReady(event) ? feeAmounts(event)[type] : 0;
  }

  function feeSummary(event) {
    if (!feesReady(event)) return "";
    const fees = feeAmounts(event);
    const won = (amount) => `${amount.toLocaleString("ko-KR")}원`;
    return fees.student === fees.graduate
      ? won(fees.student)
      : `재학생 ${won(fees.student)} · 졸업생 ${won(fees.graduate)}`;
  }

  window.KURegistrationFees = Object.freeze({ participantTypes, participantLabel, validFee, hasSeparateFees, feeAmounts, feesReady, participantAmount, feeSummary });
})();
