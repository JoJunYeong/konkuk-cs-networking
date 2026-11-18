import assert from "node:assert/strict";
import test from "node:test";
import { participantKey, participationTier, summarizeParticipation } from "../assets/participation.js";

test("tier thresholds use disjoint ranges", () => {
  const counts = [0, 4, 5, 9, 10, 14, 15, 19, 20, 21];
  assert.deepEqual(counts.map((count) => participationTier(count).key), [
    "bronze", "bronze", "silver", "silver", "gold", "gold", "platinum", "platinum", "diamond", "diamond",
  ]);
});

test("rank counts one confirmation per person and round, with just three places", () => {
  function rows(name, digits, total) {
    return Array.from({ length: total }, (_, index) => ({
      id: `${digits}-${index}`,
      name,
      phoneDigits: digits,
      status: "confirmed",
      eventId: `${2021 + index}-Q4`,
    }));
  }
  const four = rows("정가상", "01000000004", 4);
  const three = rows("김가상", "01000000003", 3);
  const tie = rows("이가상", "01000000030", 3);
  const two = rows("박가상", "01000000002", 2);
  const registrations = [
    ...tie, ...two, ...three, ...four,
    { ...four[0], id: "duplicate", phoneDigits: null, phone: "+82 10-0000-0004" },
    { ...four[0], id: "pending", eventId: "2026-Q4", status: "payment_reported" },
    { ...four[0], id: "refund", eventId: "2025-Q4", status: "refund_completed" },
  ];
  const ranks = summarizeParticipation(registrations);
  assert.deepEqual([...ranks.values()].map(({ name, count, place }) => [name, count, place]), [
    ["정가상", 4, 1], ["김가상", 3, 2], ["이가상", 3, 3], ["박가상", 2, null],
  ]);
  assert.equal(ranks.get(participantKey(four[0])).rounds.has("2026-Q4"), false);
  assert.notEqual(participantKey({ id: "legacy-a", name: "동명이인" }), participantKey({ id: "legacy-b", name: "동명이인" }));
});
