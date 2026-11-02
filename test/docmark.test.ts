import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertBase64,
  convertBatch,
  convertUrl,
  formatPayload,
  listSupportedFormats,
  resolveApiKey,
  resolveBaseUrl,
  resolveConfig,
  usageStatus,
} from "../src/docmark.js";
import type { DocmarkConfig, FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => raw,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

interface Captured { url?: string; method?: string; headers?: Record<string, string>; body?: string; calls: number }
function fakeFetch(body: unknown = {}): { fetchFn: FetchFn; captured: Captured } {
  const captured: Captured = { calls: 0 };
  const fetchFn: FetchFn = async (url, init) => {
    captured.calls += 1;
    captured.url = url; captured.method = init?.method; captured.headers = init?.headers; captured.body = init?.body;
    return jsonResponse(body);
  };
  return { fetchFn, captured };
}

const BASE = "https://api.file2markdown.ai";
const KEYLESS: DocmarkConfig = { baseUrl: BASE };
const KEYED: DocmarkConfig = { baseUrl: BASE, apiKey: "fm-key-1" };

describe("config resolution", () => {
  it("defaults base URL, strips trailing slashes, resolves optional key", () => {
    assert.equal(resolveBaseUrl(undefined), BASE);
    assert.equal(resolveBaseUrl("  "), BASE);
    assert.equal(resolveBaseUrl("https://example.test/api/"), "https://example.test/api");
    assert.equal(resolveApiKey(undefined), undefined);
    assert.equal(resolveApiKey("  "), undefined);
    assert.equal(resolveApiKey(" k "), "k");
    const cfg = resolveConfig({ DOCMARK_API_URL: "https://example.test/", FILE2MARKDOWN_API_KEY: " abc " });
    assert.equal(cfg.baseUrl, "https://example.test");
    assert.equal(cfg.apiKey, "abc");
    assert.equal(resolveConfig({}).apiKey, undefined);
  });
});

describe("auth header", () => {
  it("sends no Authorization header when the key is absent (keyless free tier)", async () => {
    const { fetchFn, captured } = fakeFetch({ markdown: "# Hi", truncated: false });
    const out = await convertUrl(fetchFn, KEYLESS, { url: "https://example.com/doc.pdf" });
    assert.deepEqual(out, { markdown: "# Hi", truncated: false });
    assert.equal(captured.headers?.Authorization, undefined);
    assert.equal(captured.method, "POST");
    assert.equal(captured.url, `${BASE}/convert/url`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { url: "https://example.com/doc.pdf" });
  });
  it("sends Authorization Bearer only when the key is set", async () => {
    const { fetchFn, captured } = fakeFetch({ tier: "pro" });
    await usageStatus(fetchFn, KEYED);
    assert.equal(captured.headers?.Authorization, "Bearer fm-key-1");
    assert.equal(captured.url, `${BASE}/usage`);
    const second = fakeFetch({ formats: [] });
    await listSupportedFormats(second.fetchFn, KEYLESS);
    assert.equal(second.captured.headers?.Authorization, undefined);
  });
});

describe("convert tools", () => {
  it("convert_base64 forwards content and optional filename, omits filename when absent", async () => {
    const { fetchFn, captured } = fakeFetch({ markdown: "hello" });
    await convertBase64(fetchFn, KEYLESS, { content_base64: "aGVsbG8=", filename: "note.txt" });
    assert.equal(captured.url, `${BASE}/convert/base64`);
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { content_base64: "aGVsbG8=", filename: "note.txt" });
    const second = fakeFetch({ markdown: "x" });
    await convertBase64(second.fetchFn, KEYLESS, { content_base64: "eA==" });
    assert.deepEqual(JSON.parse(second.captured.body ?? "{}"), { content_base64: "eA==" });
  });
  it("rejects blank url and blank content before any request", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => convertUrl(fetchFn, KEYLESS, { url: "  " }), /url must be a non-empty/);
    await assert.rejects(() => convertBase64(fetchFn, KEYLESS, { content_base64: "" }), /content_base64 must be a non-empty/);
    assert.equal(captured.calls, 0);
  });
  it("surfaces the upstream payload as-is, including the truncated flag", async () => {
    const payload = { markdown: "x".repeat(10), truncated: true, char_limit: 200000 };
    const { fetchFn } = fakeFetch(payload);
    const out = await convertUrl(fetchFn, KEYLESS, { url: "https://example.com/big.pdf" });
    assert.deepEqual(out, payload);
    assert.equal(formatPayload(out), JSON.stringify(payload, null, 2));
  });
});

describe("convert_batch", () => {
  it("forwards a valid mixed batch of 2 items", async () => {
    const { fetchFn, captured } = fakeFetch({ results: [{ markdown: "a" }, { markdown: "b" }] });
    const out = await convertBatch(fetchFn, KEYED, { items: [{ url: "https://example.com/a.pdf" }, { content_base64: "eA==", filename: "x.txt" }] }) as { results: unknown[] };
    assert.equal(out.results.length, 2);
    assert.equal(captured.url, `${BASE}/convert/batch`);
    assert.equal(captured.headers?.Authorization, "Bearer fm-key-1");
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), { items: [{ url: "https://example.com/a.pdf" }, { content_base64: "eA==", filename: "x.txt" }] });
  });
  it("accepts exactly 10 items and rejects 1 and 11 items before any request", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/${i}` }));
    const ok = fakeFetch({ results: [] });
    await convertBatch(ok.fetchFn, KEYLESS, { items: ten });
    assert.equal(ok.captured.calls, 1);
    const bad = fakeFetch({});
    await assert.rejects(() => convertBatch(bad.fetchFn, KEYLESS, { items: [{ url: "https://example.com/a" }] }), /between 2 and 10/);
    await assert.rejects(() => convertBatch(bad.fetchFn, KEYLESS, { items: [...ten, { url: "https://example.com/extra" }] }), /between 2 and 10/);
    assert.equal(bad.captured.calls, 0);
  });
  it("rejects a batch item with neither url nor content_base64", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await assert.rejects(() => convertBatch(fetchFn, KEYLESS, { items: [{ url: "https://example.com/a" }, { filename: "orphan.txt" }] }), /either url or content_base64/);
    assert.equal(captured.calls, 0);
  });
});

describe("formats and usage", () => {
  it("list_supported_formats POSTs an empty body to /formats", async () => {
    const payload = { formats: ["pdf", "docx"], pro_only: ["audio"] };
    const { fetchFn, captured } = fakeFetch(payload);
    assert.deepEqual(await listSupportedFormats(fetchFn, KEYLESS), payload);
    assert.equal(captured.url, `${BASE}/formats`);
    assert.equal(captured.method, "POST");
    assert.deepEqual(JSON.parse(captured.body ?? "{}"), {});
  });
  it("usage_status POSTs to /usage and returns tier info as-is", async () => {
    const payload = { tier: "free", remaining_today: 7 };
    const { fetchFn, captured } = fakeFetch(payload);
    assert.deepEqual(await usageStatus(fetchFn, KEYLESS), payload);
    assert.equal(captured.url, `${BASE}/usage`);
  });
  it("honours a custom base URL", async () => {
    const { fetchFn, captured } = fakeFetch({});
    await usageStatus(fetchFn, { baseUrl: "https://example.test/v1/" });
    assert.equal(captured.url, "https://example.test/v1/usage");
  });
});

describe("upstream failures", () => {
  it("surfaces HTTP failures with status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "quota exceeded" }, 429, "Too Many Requests");
    await assert.rejects(() => convertUrl(failing, KEYLESS, { url: "https://example.com/a" }), /HTTP 429.*quota exceeded/);
  });
  it("wraps network failures", async () => {
    const failing: FetchFn = async () => { throw new Error("fetch failed"); };
    await assert.rejects(() => usageStatus(failing, KEYLESS), /file2markdown API request failed: fetch failed/);
  });
  it("returns a plain-text upstream body as a string", async () => {
    const textFetch: FetchFn = async () => ({
      ok: true, status: 200, statusText: "OK", headers: { get: () => null },
      text: async () => "# Plain markdown", json: async () => { throw new Error("not json"); },
    });
    assert.equal(await convertUrl(textFetch, KEYLESS, { url: "https://example.com/a" }), "# Plain markdown");
  });
});
