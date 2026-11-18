const tiers = [
  { minimum: 0, key: "bronze", label: "브론즈" },
  { minimum: 5, key: "silver", label: "실버" },
  { minimum: 10, key: "gold", label: "골드" },
  { minimum: 15, key: "platinum", label: "플래티넘" },
  { minimum: 20, key: "diamond", label: "다이아" },
];

export function participationTier(count) {
  return tiers.findLast((tier) => count >= tier.minimum);
}

export function participantKey(registration) {
  const phone = [registration.phoneDigits, registration.phone]
    .map((value) => String(value ?? "").replace(/\D/g, "").replace(/^82(?=1\d{8,9}$)/, "0"))
    .find((digits) => /^01\d{8,9}$/.test(digits));
  return phone ? `phone:${phone}` : `registration:${registration.id}`;
}

export function summarizeParticipation(registrations) {
  const byParticipant = new Map();
  for (const registration of registrations) {
    if (registration.status !== "confirmed" || !registration.eventId) continue;
    const key = participantKey(registration);
    if (!byParticipant.has(key)) byParticipant.set(key, new Map());
    const rounds = byParticipant.get(key);
    if (!rounds.has(registration.eventId)) rounds.set(registration.eventId, registration);
  }

  const rankings = [...byParticipant].map(([key, rounds]) => {
    const latestRound = [...rounds.keys()].sort().at(-1);
    return { key, rounds, count: rounds.size, name: rounds.get(latestRound).name || "" };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko") || a.key.localeCompare(b.key));

  return new Map(rankings.map((participant, index) => [participant.key, {
    ...participant,
    place: index < 3 ? index + 1 : null,
  }]));
}
