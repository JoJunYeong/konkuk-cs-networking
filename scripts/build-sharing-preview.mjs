import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { shareImageURL } from "../assets/share-image.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const block = /<!-- sharing-preview:start -->[\s\S]*?<!-- sharing-preview:end -->/;
const roundId = /^\d{4}-Q[1-4]$/;

export function latestRound(saved, configured) {
  const validRounds = (events) => events.filter((event) => typeof event?.id === "string" && roundId.test(event.id));
  const managed = validRounds(saved);
  const fallback = validRounds(configured);
  const latest = [...(managed.length ? managed : fallback)].sort((a, b) => b.id.localeCompare(a.id))[0];
  const staticMatch = fallback.find((event) => event.id === latest?.id);
  return (Number(staticMatch?.revision) || 0) > (Number(latest?.revision) || 0) ? staticMatch : latest;
}

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function previewFor(round, site) {
  const quarter = clean(round?.quarter) || round?.id?.replace("-", " ") || "";
  const heading = [clean(round?.titleLineOne), clean(round?.titleLineTwo)].filter(Boolean);
  if (!heading.length) heading.push(clean(site.title) || "건국 컴공 네트워킹");
  const schedule = [clean(round?.dateLabel), clean(round?.time)].filter(Boolean).join(" ");
  const venue = clean(round?.venue);
  return {
    quarter,
    heading,
    schedule,
    venue,
    title: [quarter, ...heading].filter(Boolean).join(" "),
    description: [clean(round?.description), schedule, venue].filter(Boolean).join(" · ") || clean(site.shareText),
    image: shareImageURL(round?.shareImageUrl),
  };
}

function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderPreviewHtml(html, preview, generatedImage) {
  if (!block.test(html)) throw new Error("Sharing preview markers missing from index.html");
  const tag = (type, key, value) => `    <meta ${type}="${key}" content="${escapeAttribute(value)}" />`;
  const image = preview.image || generatedImage;
  return html.replace(block, () => [
    "<!-- sharing-preview:start -->",
    tag("name", "description", preview.description),
    tag("property", "og:title", preview.title),
    tag("property", "og:description", preview.description),
    tag("property", "og:image", image),
    ...(!preview.image ? [tag("property", "og:image:width", "1200"), tag("property", "og:image:height", "630")] : []),
    tag("name", "twitter:title", preview.title),
    tag("name", "twitter:description", preview.description),
    tag("name", "twitter:image", image),
    "    <!-- sharing-preview:end -->",
  ].join("\n"));
}

async function readConfig(file, key) {
  const scope = { window: {} };
  runInNewContext(await readFile(join(root, "config", file), "utf8"), scope);
  return scope.window[key];
}

async function loadManagedEvents(runtime) {
  const project = encodeURIComponent(runtime.firebase.projectId);
  const collection = encodeURIComponent(runtime.collection || "siteData");
  const document = encodeURIComponent(runtime.documents?.events || "events");
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${document}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Public events could not be loaded (HTTP ${response.status})`);
  const data = await response.json();
  const events = JSON.parse(data.fields?.payload?.stringValue || "null");
  if (!Array.isArray(events)) throw new Error("Public events document has an invalid payload");
  return events;
}

function renderImage(preview) {
  const { quarter, heading, schedule, venue } = preview;
  const result = spawnSync(process.env.PREVIEW_PYTHON || "python3", [join(root, "scripts/render-sharing-preview.py")], {
    input: JSON.stringify({ quarter, heading, schedule, venue }),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Sharing image failed to render\n${result.stderr.toString()}`);
  return result.stdout;
}

async function build(outputDirectory) {
  const [config, runtime, html] = await Promise.all([
    readConfig("site.config.js", "NETWORKING_SITE_CONFIG"),
    readConfig("firebase.config.js", "KU_ADMIN_FIREBASE"),
    readFile(join(root, "index.html"), "utf8"),
  ]);
  const preview = previewFor(latestRound(await loadManagedEvents(runtime), config.events), config.site);
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!canonical) throw new Error("Canonical URL missing from index.html");
  await mkdir(outputDirectory);
  await Promise.all([".nojekyll", "admin.html", "assets", "config", "data"].map((file) =>
    cp(join(root, file), join(outputDirectory, file), { recursive: true }),
  ));
  let generatedImage;
  if (!preview.image) {
    const png = renderImage(preview);
    const hash = createHash("sha256").update(png).digest("hex").slice(0, 12);
    const path = `assets/share-preview-${hash}.png`;
    await writeFile(join(outputDirectory, path), png);
    generatedImage = new URL(path, canonical).href;
  }
  await writeFile(join(outputDirectory, "index.html"), renderPreviewHtml(html, preview, generatedImage));
  console.log(`Prepared sharing preview for ${preview.quarter || "the networking site"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/build-sharing-preview.mjs <new output directory>");
  await build(resolve(process.argv[2]));
}
