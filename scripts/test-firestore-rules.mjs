const host = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT || "ku-cse-quarterly-admin";

if (!host) throw new Error("FIRESTORE_EMULATOR_HOST is required");

const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const documentName = (path) => `projects/${projectId}/databases/(default)/documents/${path}`;
const stringValue = (value) => ({ stringValue: value });
const integerValue = (value) => ({ integerValue: String(value) });
const booleanValue = (value) => ({ booleanValue: value });

function emulatorToken(uid) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({
    aud: projectId,
    auth_time: now,
    exp: now + 3600,
    iat: now,
    iss: `https://securetoken.google.com/${projectId}`,
    sub: uid,
    user_id: uid,
  })}.`;
}

async function request(path, options = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
}

async function expectStatus(label, response, expected) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label}: expected ${expected}, received ${response.status}\n${body}`);
  }
  console.log(`PASS ${label} (${response.status})`);
}

async function seedGate(accepting, deadline = { nullValue: null }, amounts) {
  return request("/registrationGates/2026-Q3", {
    method: "PATCH",
    headers: { authorization: "Bearer owner" },
    body: JSON.stringify({
      fields: {
        eventId: stringValue("2026-Q3"),
        eventQuarter: stringValue("2026 Q3"),
        mode: stringValue("manual_transfer"),
        amount: integerValue(10000),
        capacity: integerValue(100),
        accepting: booleanValue(accepting),
        registrationDeadline: deadline,
        ...(amounts === undefined ? {} : { paymentAmounts: { mapValue: { fields: Object.fromEntries(Object.entries(amounts).map(([type, amount]) => [type, integerValue(amount)])) } } }),
      },
    }),
  });
}

async function createRegistration(id, overrides = {}) {
  const values = {
    eventId: "2026-Q3",
    eventQuarter: "2026 Q3",
    status: "payment_reported",
    name: "규칙 테스트",
    phone: "010-1234-5678",
    phoneDigits: "01012345678",
    depositorName: "규칙테스트",
    amount: 10000,
    paymentReported: true,
    privacyConsent: true,
    consentVersion: "2026-09-04-v1",
    clientTimezone: "Asia/Seoul",
    source: "public_web",
    ...overrides,
  };
  const fields = {
    eventId: stringValue(values.eventId),
    eventQuarter: stringValue(values.eventQuarter),
    status: stringValue(values.status),
    name: stringValue(values.name),
    phone: stringValue(values.phone),
    phoneDigits: stringValue(values.phoneDigits),
    depositorName: stringValue(values.depositorName),
    amount: integerValue(values.amount),
    paymentReported: booleanValue(values.paymentReported),
    privacyConsent: booleanValue(values.privacyConsent),
    consentVersion: stringValue(values.consentVersion),
    clientTimezone: stringValue(values.clientTimezone),
    source: stringValue(values.source),
    ...(values.participantType === undefined ? {} : { participantType: stringValue(values.participantType) }),
  };
  return request(":commit", {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        update: { name: documentName(`registrations/${id}`), fields },
        updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
      }],
    }),
  });
}

async function createRefund(id, phoneDigits = "01012345678") {
  const fields = {
    registrationId: stringValue(id),
    eventId: stringValue("2026-Q3"),
    status: stringValue("refund_requested"),
    phoneDigits: stringValue(phoneDigits),
    refundBank: stringValue("테스트은행"),
    refundAccount: stringValue("123456789012"),
    refundAccountHolder: stringValue("규칙 테스트"),
    refundConsent: booleanValue(true),
    source: stringValue("public_web"),
  };
  return request(":commit", {
    method: "POST",
    body: JSON.stringify({
      writes: [{
        update: { name: documentName(`refundRequests/${id}`), fields },
        updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
      }],
    }),
  });
}

const deniedWhileClosedId = "00000000000000000000000000000001";
const validId = "00000000000000000000000000000002";
const spoofedId = "00000000000000000000000000000003";
const wrongAmountId = "00000000000000000000000000000004";

await expectStatus("seed closed gate", await seedGate(false), 200);
await expectStatus("closed gate rejects registration", await createRegistration(deniedWhileClosedId), 403);
await expectStatus("seed open gate", await seedGate(true), 200);
await expectStatus("open gate accepts valid registration", await createRegistration(validId), 200);
await expectStatus("public cannot read registration", await request(`/registrations/${validId}`), 403);
await expectStatus(
  "wrong authenticated user cannot read registration",
  await request(`/registrations/${validId}`, {
    headers: { authorization: `Bearer ${emulatorToken("not-the-admin")}` },
  }),
  403,
);
await expectStatus(
  "configured admin can read registration",
  await request(`/registrations/${validId}`, {
    headers: { authorization: `Bearer ${emulatorToken("uk5noSfHHMU3y9l7CPkG5F0YRl33")}` },
  }),
  200,
);
await expectStatus("public cannot self-confirm", await createRegistration(spoofedId, { status: "confirmed" }), 403);
await expectStatus("gate rejects wrong amount", await createRegistration(wrongAmountId, { amount: 9999 }), 403);
await expectStatus("wrong phone rejects refund", await createRefund(validId, "01099999999"), 403);
await expectStatus("matching phone accepts refund", await createRefund(validId), 200);
await expectStatus("public cannot read refund account", await request(`/refundRequests/${validId}`), 403);

await expectStatus("seed future deadline", await seedGate(true, { timestampValue: new Date(Date.now() + 3600000).toISOString() }), 200);
await expectStatus("before deadline accepts registration", await createRegistration("00000000000000000000000000000005"), 200);
await expectStatus("seed expired deadline", await seedGate(true, { timestampValue: new Date(Date.now() - 1000).toISOString() }), 200);
await expectStatus("expired deadline rejects registration", await createRegistration("00000000000000000000000000000006"), 403);
await expectStatus("existing applicant can request refund after deadline", await createRefund("00000000000000000000000000000005"), 200);
await expectStatus("admin can confirm after deadline", await request(`/registrations/${validId}?updateMask.fieldPaths=status`, {
  method: "PATCH",
  headers: { authorization: `Bearer ${emulatorToken("uk5noSfHHMU3y9l7CPkG5F0YRl33")}` },
  body: JSON.stringify({ fields: { status: stringValue("confirmed") } }),
}), 200);
await expectStatus("seed invalid deadline", await seedGate(true, stringValue("2026-09-07T23:59")), 200);
await expectStatus("invalid deadline fails closed", await createRegistration("00000000000000000000000000000007"), 403);
await expectStatus("admin cannot drop deadline field", await request("/registrationGates/2026-Q3", {
  method: "PATCH",
  headers: { authorization: `Bearer ${emulatorToken("uk5noSfHHMU3y9l7CPkG5F0YRl33")}` },
  body: JSON.stringify({ fields: { accepting: booleanValue(true) } }),
}), 403);
await expectStatus("seed gate without deadline", await request("/registrationGates/2026-Q3?updateMask.fieldPaths=registrationDeadline", {
  method: "PATCH", headers: { authorization: "Bearer owner" }, body: JSON.stringify({ fields: {} }),
}), 200);
await expectStatus("missing deadline fails closed", await createRegistration("00000000000000000000000000000009"), 403);
await expectStatus("restore no deadline", await seedGate(true), 200);
await expectStatus("explicit no deadline accepts registration", await createRegistration("00000000000000000000000000000008"), 200);

const feeId = (number) => number.toString(16).padStart(32, "0");
await expectStatus("new student on legacy gate", await createRegistration(feeId(32), { participantType: "student" }), 200);
await expectStatus("new graduate on legacy gate", await createRegistration(feeId(33), { participantType: "graduate" }), 200);
await expectStatus("legacy gate rejects invalid category", await createRegistration(feeId(34), { participantType: "other" }), 403);
await expectStatus("seed separate fees", await seedGate(true, { nullValue: null }, { student: 8000, graduate: 20000 }), 200);
await expectStatus("student pays student fee", await createRegistration(feeId(35), { participantType: "student", amount: 8000 }), 200);
await expectStatus("graduate pays graduate fee", await createRegistration(feeId(36), { participantType: "graduate", amount: 20000 }), 200);
await expectStatus("graduate cannot use student fee", await createRegistration(feeId(37), { participantType: "graduate", amount: 8000 }), 403);
await expectStatus("student cannot use old single fee", await createRegistration(feeId(38), { participantType: "student", amount: 10000 }), 403);
await expectStatus("separate fees require category", await createRegistration(feeId(39), { amount: 8000 }), 403);
await expectStatus("separate fees reject invalid category", await createRegistration(feeId(40), { participantType: "other", amount: 8000 }), 403);
await expectStatus("admin cannot erase separate fees with old editor", await request("/registrationGates/2026-Q3", {
  method: "PATCH", headers: { authorization: `Bearer ${emulatorToken("uk5noSfHHMU3y9l7CPkG5F0YRl33")}` },
  body: JSON.stringify({ fields: { accepting: booleanValue(true), mode: stringValue("manual_transfer"), amount: integerValue(8000), registrationDeadline: { nullValue: null } } }),
}), 403);
await expectStatus("closed separate gate", await seedGate(false, { nullValue: null }, { student: 8000, graduate: 20000 }), 200);
await expectStatus("closed gate rejects student", await createRegistration(feeId(41), { participantType: "student", amount: 8000 }), 403);
await expectStatus("expired separate gate", await seedGate(true, { timestampValue: new Date(Date.now() - 1000).toISOString() }, { student: 8000, graduate: 20000 }), 200);
await expectStatus("expired gate rejects graduate", await createRegistration(feeId(42), { participantType: "graduate", amount: 20000 }), 403);
await expectStatus("seed malformed separate fees", await seedGate(true, { nullValue: null }, { student: 10000 }), 200);
await expectStatus("malformed schedule cannot fall back to legacy amount", await createRegistration(feeId(43), { participantType: "student", amount: 10000 }), 403);
await expectStatus("seed fee above limit", await seedGate(true, { nullValue: null }, { student: 8000, graduate: 1000001 }), 200);
await expectStatus("invalid schedule rejects even otherwise valid student fee", await createRegistration(feeId(44), { participantType: "student", amount: 8000 }), 403);
await expectStatus("change fees for future applicants", await seedGate(true, { nullValue: null }, { student: 12000, graduate: 25000 }), 200);
const existing = await request(`/registrations/${feeId(36)}`, { headers: { authorization: `Bearer ${emulatorToken("uk5noSfHHMU3y9l7CPkG5F0YRl33")}` } });
const existingData = await existing.json();
if (existing.status !== 200 || existingData.fields.amount.integerValue !== "20000" || existingData.fields.participantType.stringValue !== "graduate") throw new Error("Existing registration changed after fee update");
console.log("PASS existing participant category and submitted amount remain unchanged");
await expectStatus("existing graduate refund still works", await createRefund(feeId(36)), 200);

console.log("All Firestore rule checks passed.");
