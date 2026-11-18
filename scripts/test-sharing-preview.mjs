import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { latestRound, previewFor, renderPreviewHtml } from "./build-sharing-preview.mjs";

test("share the newest saved round even when the home page features a different one", () => {
  const q3 = { id: "2026-Q3", featured: true };
  const q4 = { id: "2026-Q4", featured: false, status: "upcoming", revision: 100 };
  const q1 = { id: "2027-Q1", featured: false };
  assert.equal(latestRound([q4, q3], [q1]), q4);
  assert.equal(latestRound([q4, q1, q3], []), q1);
  assert.equal(latestRound([], [q3, q4]), q4);
  const edited = { ...q4, revision: 101 };
  assert.equal(latestRound([q4], [edited]), edited);
});

test("emit crawlable metadata and escape round text and its share image URL", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const round = {
    id: "2026-Q4",
    titleLineOne: '선후배 "모임" & 네트워킹',
    description: "신규 소개 <테스트>",
    dateLabel: "11월 27일",
    venue: "건국대",
    shareImageUrl: "https://example.com/q4.png?a=1&b=2",
  };
  const preview = previewFor(round, {});
  const rendered = renderPreviewHtml(html, preview);
  assert.match(rendered, /property="og:title" content="2026 Q4 선후배 &quot;모임&quot; &amp; 네트워킹"/);
  assert.match(rendered, /property="og:description" content="신규 소개 &lt;테스트&gt; · 11월 27일 · 건국대"/);
  assert.match(rendered, /name="twitter:image" content="https:\/\/example\.com\/q4\.png\?a=1&amp;b=2"/);
  assert.doesNotMatch(rendered, /og:image:width|event-2026-q3/);
  for (const unsafe of ["http://example.com/photo.png", "javascript:alert(1)", "https://user:password@example.com/photo.png"]) {
    assert.equal(previewFor({ ...round, shareImageUrl: unsafe }, {}).image, null);
  }
  const generated = renderPreviewHtml(html, previewFor({ ...round, shareImageUrl: "" }, {}), "https://example.com/generated.png");
  assert.match(generated, /property="og:image" content="https:\/\/example\.com\/generated\.png"/);
  assert.match(generated, /property="og:image:width" content="1200"/);
});
