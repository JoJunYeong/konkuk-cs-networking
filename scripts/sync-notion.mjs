import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const API_VERSION = "2026-03-11";
const HISTORY_PATH = new URL("../data/history.json", import.meta.url);
const isValidationOnly = process.argv.includes("--validate");

const FIELD_NAMES = {
  publish: ["공개", "게시", "publish", "public", "website"],
  date: ["활동 날짜", "날짜", "행사 날짜", "date", "event date"],
  venue: ["장소", "venue", "location"],
  attendees: ["참여 인원", "참석 인원", "attendees", "attendance"],
  summary: ["요약", "공개 요약", "summary", "description"],
  highlights: ["핵심 프로그램", "프로그램", "highlights", "tags"],
  learning: ["공개 회고", "회고", "learning", "retrospective"],
  sequence: ["회차", "sequence", "number"],
};

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s_-]+/g, " ");
}

function findPropertyName(properties, candidates, expectedType) {
  const entries = Object.entries(properties || {});
  const normalizedCandidates = candidates.map(normalizeName);
  const named = entries.find(([name, property]) => {
    const nameMatches = normalizedCandidates.includes(normalizeName(name));
    return nameMatches && (!expectedType || property?.type === expectedType);
  });
  return named?.[0] || "";
}

function firstPropertyName(properties, expectedType) {
  return Object.entries(properties || {}).find(([, property]) => property?.type === expectedType)?.[0] || "";
}

function richText(value) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => item?.plain_text || item?.text?.content || "").join("").trim();
}

function propertyValue(property) {
  if (!property || !property.type) return "";

  switch (property.type) {
    case "title":
      return richText(property.title);
    case "rich_text":
      return richText(property.rich_text);
    case "number":
      return property.number;
    case "date":
      return property.date?.start || "";
    case "checkbox":
      return Boolean(property.checkbox);
    case "select":
      return property.select?.name || "";
    case "status":
      return property.status?.name || "";
    case "multi_select":
      return (property.multi_select || []).map((item) => item.name).filter(Boolean);
    case "formula":
      return property.formula?.[property.formula?.type] ?? "";
    default:
      return "";
  }
}

function valueByName(properties, name) {
  return name ? propertyValue(properties?.[name]) : "";
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseSequence(value, title) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = /제\s*(\d+)\s*회/.exec(String(title || ""));
  return match ? Number(match[1]) : null;
}

function eventId(date, sequence, title) {
  const base = [date, sequence || compactText(title)]
    .filter(Boolean)
    .join("-")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-|-$/g, "");
  return `networking-day-${base || "record"}`;
}

function asHighlights(value) {
  if (Array.isArray(value)) return value.map(compactText).filter(Boolean);
  return compactText(value)
    .split(/[,·|]/)
    .map(compactText)
    .filter(Boolean);
}

function findExisting(events, candidate) {
  return events.find(
    (event) =>
      (candidate.date && event.date === candidate.date && event.sequence === candidate.sequence) ||
      (candidate.date && event.date === candidate.date && event.title === candidate.title),
  );
}

function mergeDefined(base, incoming) {
  const merged = { ...base };
  Object.entries(incoming).forEach(([key, value]) => {
    const hasValue = Array.isArray(value) ? value.length > 0 : value !== "" && value !== null && value !== undefined;
    if (hasValue) merged[key] = value;
  });
  return merged;
}

function validateHistory(history) {
  if (!history || !Array.isArray(history.events)) throw new Error("history.json의 events 배열이 필요합니다.");

  const ids = new Set();
  history.events.forEach((event, index) => {
    if (!event.id || ids.has(event.id)) throw new Error(`events[${index}]의 id가 없거나 중복됩니다.`);
    ids.add(event.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event.date || ""))) {
      throw new Error(`events[${index}]의 date는 YYYY-MM-DD 형식이어야 합니다.`);
    }
    if (!compactText(event.title)) throw new Error(`events[${index}]의 title이 비어 있습니다.`);
    if (event.attendees !== undefined && (!Number.isFinite(Number(event.attendees)) || Number(event.attendees) < 0)) {
      throw new Error(`events[${index}]의 attendees는 0 이상의 숫자여야 합니다.`);
    }
  });

  const serialized = JSON.stringify(history);
  if (/\b\d{7,}\b/.test(serialized)) {
    throw new Error("공개 기록에서 계좌번호나 전화번호로 보이는 긴 숫자열을 발견했습니다.");
  }
  if (/"(?:phone|account|bank|email|cover|photo|image)"\s*:/i.test(serialized)) {
    throw new Error("공개 기록에 허용되지 않은 개인정보 또는 이미지 필드가 포함되어 있습니다.");
  }
}

async function readHistory() {
  return JSON.parse(await readFile(HISTORY_PATH, "utf8"));
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function notionRequest(path, options = {}) {
  const token = process.env.NOTION_TOKEN;
  let lastError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.notion.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": API_VERSION,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (response.ok) return response.json();
    const message = await response.text();
    lastError = new Error(`Notion API ${response.status}: ${message.slice(0, 500)}`);
    if (response.status !== 429 && response.status < 500) break;
    const retryAfter = Number(response.headers.get("retry-after")) || attempt + 1;
    await wait(Math.min(retryAfter, 10) * 1000);
  }

  throw lastError;
}

async function resolveDataSourceId(databaseId) {
  if (process.env.NOTION_DATA_SOURCE_ID) return process.env.NOTION_DATA_SOURCE_ID;
  const database = await notionRequest(`/databases/${databaseId}`);
  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) throw new Error("Notion 데이터베이스에서 data source ID를 찾지 못했습니다.");
  return dataSourceId;
}

async function queryAllPages(dataSourceId) {
  const pages = [];
  let startCursor;

  do {
    const response = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
    });
    pages.push(...(response.results || []).filter((item) => item.object === "page"));
    startCursor = response.has_more ? response.next_cursor : null;
  } while (startCursor);

  return pages;
}

async function sync() {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token) throw new Error("NOTION_TOKEN 환경 변수가 필요합니다.");
  if (!databaseId) throw new Error("NOTION_DATABASE_ID 환경 변수가 필요합니다.");

  const existing = await readHistory();
  validateHistory(existing);

  const dataSourceId = await resolveDataSourceId(databaseId);
  const schema = await notionRequest(`/data_sources/${dataSourceId}`);
  const schemaProperties = schema.properties || {};
  const pages = await queryAllPages(dataSourceId);

  const publishName = findPropertyName(schemaProperties, FIELD_NAMES.publish, "checkbox");
  const allowUnfiltered = process.env.NOTION_ALLOW_UNFILTERED === "true";
  if (!publishName && !allowUnfiltered) {
    throw new Error("Notion DB에 '공개' checkbox가 없습니다. 공개 범위를 먼저 만든 뒤 다시 실행하세요.");
  }

  const names = {
    title: firstPropertyName(schemaProperties, "title"),
    date: findPropertyName(schemaProperties, FIELD_NAMES.date, "date") || firstPropertyName(schemaProperties, "date"),
    venue: findPropertyName(schemaProperties, FIELD_NAMES.venue),
    attendees: findPropertyName(schemaProperties, FIELD_NAMES.attendees),
    summary: findPropertyName(schemaProperties, FIELD_NAMES.summary),
    highlights: findPropertyName(schemaProperties, FIELD_NAMES.highlights),
    learning: findPropertyName(schemaProperties, FIELD_NAMES.learning),
    sequence: findPropertyName(schemaProperties, FIELD_NAMES.sequence),
  };

  if (!names.title || !names.date) throw new Error("Notion DB에서 제목 또는 날짜 속성을 찾지 못했습니다.");

  const visiblePages = pages.filter((page) => allowUnfiltered || valueByName(page.properties, publishName) === true);
  if (visiblePages.length === 0 && existing.events.length > 0 && process.env.NOTION_ALLOW_EMPTY !== "true") {
    throw new Error("공개 체크된 행이 없어 기존 아카이브를 보존했습니다.");
  }

  const skipped = [];
  const events = visiblePages
    .map((page) => {
      const properties = page.properties || {};
      const title = compactText(valueByName(properties, names.title));
      const rawDate = compactText(valueByName(properties, names.date));
      const date = rawDate.slice(0, 10);
      const sequence = parseSequence(valueByName(properties, names.sequence), title);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        skipped.push(title || page.id);
        return null;
      }

      const incoming = {
        sequence,
        date,
        title,
        venue: compactText(valueByName(properties, names.venue)),
        attendees: valueByName(properties, names.attendees),
        summary: compactText(valueByName(properties, names.summary)),
        highlights: asHighlights(valueByName(properties, names.highlights)),
        learning: compactText(valueByName(properties, names.learning)),
      };
      const previous = findExisting(existing.events, incoming) || {};
      return mergeDefined(
        {
          ...previous,
          id: previous.id || eventId(date, sequence, title),
        },
        incoming,
      );
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  const next = {
    ...existing,
    schemaVersion: 1,
    events,
  };
  validateHistory(next);

  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const current = await readFile(HISTORY_PATH, "utf8");
  if (serialized === current) {
    console.log(`Notion 공개 기록 ${events.length}건: 변경 없음`);
  } else {
    await writeFile(HISTORY_PATH, serialized, "utf8");
    console.log(`Notion 공개 기록 ${events.length}건을 data/history.json에 반영했습니다.`);
  }
  if (skipped.length > 0) console.warn(`제목 또는 날짜가 없어 건너뜀: ${skipped.join(", ")}`);
}

if (isValidationOnly) {
  const history = await readHistory();
  validateHistory(history);
  console.log(`data/history.json 검증 완료: ${history.events.length}건`);
} else {
  await sync();
}
