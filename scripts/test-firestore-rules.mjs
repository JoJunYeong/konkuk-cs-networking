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

async function seedGate(accepting) {
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

console.log("All Firestore rule checks passed.");
