/**
 * docmark core: forwarding client for the hosted file2markdown
 * document-to-Markdown conversion service.
 *
 * The upstream is a hosted service, not a local engine. This module
 * does not convert anything itself: each tool call becomes one JSON
 * POST to the service's HTTP API and the upstream payload is
 * returned as-is (including its markdown text, its truncated flag
 * when output exceeds the service's 200,000-character cap, and any
 * per-item batch results).
 *
 * Wire shape (labelled reconstruction): POST JSON to paths under
 * the API base —
 *   convert_url            POST /convert/url        {url}
 *   convert_base64         POST /convert/base64     {content_base64, filename?}
 *   convert_batch          POST /convert/batch      {items}
 *   list_supported_formats POST /formats            {}
 *   usage_status           POST /usage              {}
 *
 * Env: FILE2MARKDOWN_API_KEY is OPTIONAL — the free tier works
 * keyless per the documented service notes. When a key is present
 * it is sent as `Authorization: Bearer <key>`; when absent no
 * Authorization header is sent and no error is raised.
 * DOCMARK_API_URL overrides the API base (default
 * https://api.file2markdown.ai, labelled reconstruction); trailing
 * slashes are stripped.
 *
 * Batch limits are documented as 2–10 items; that range and the
 * per-item shape (a url, or base64 content with an optional
 * filename) are enforced locally before any request is made.
 *
 * All HTTP goes through an injected FetchFn so everything is
 * testable offline with a fake fetch.
 */
import type {
  BatchItem,
  ConvertBase64Options,
  ConvertBatchOptions,
  ConvertUrlOptions,
  DocmarkConfig,
  FetchFn,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.file2markdown.ai";
export const API_URL_ENV = "DOCMARK_API_URL";
export const API_KEY_ENV = "FILE2MARKDOWN_API_KEY";
export const MIN_BATCH_ITEMS = 2;
export const MAX_BATCH_ITEMS = 10;
export const MAX_OUTPUT_CHARS = 200_000;

/** Resolve the API base URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveBaseUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  return (v ? v : DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Resolve the optional API key: trimmed value when non-blank, else undefined. */
export function resolveApiKey(value?: string): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

export function resolveConfig(env: {
  [API_URL_ENV]?: string;
  [API_KEY_ENV]?: string;
}): DocmarkConfig {
  return {
    baseUrl: resolveBaseUrl(env[API_URL_ENV]),
    apiKey: resolveApiKey(env[API_KEY_ENV]),
  };
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const v = value.trim();
  return v ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function callApi(
  fetchFn: FetchFn,
  config: DocmarkConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const base = resolveBaseUrl(config?.baseUrl);
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const key = resolveApiKey(config?.apiKey);
  if (key) headers.Authorization = `Bearer ${key}`;
  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `file2markdown API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const raw = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = JSON.parse(raw);
      if (isRecord(payload)) {
        if (typeof payload.message === "string" && payload.message) detail = `: ${payload.message}`;
        else if (typeof payload.error === "string" && payload.error) detail = `: ${payload.error}`;
      }
    } catch {
      if (raw.trim()) detail = `: ${raw.trim().slice(0, 200)}`;
    }
    throw new Error(
      `file2markdown API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  if (!raw.trim()) return "";
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function checkedBatchItem(item: unknown, index: number): BatchItem {
  if (!isRecord(item)) throw new Error(`items[${index}] must be an object`);
  const url = optionalString(item.url, `items[${index}].url`);
  const content = optionalString(item.content_base64, `items[${index}].content_base64`);
  const filename = optionalString(item.filename, `items[${index}].filename`);
  if (!url && !content) {
    throw new Error(`items[${index}] must provide either url or content_base64`);
  }
  const out: BatchItem = {};
  if (url) out.url = url;
  if (content) out.content_base64 = content;
  if (filename) out.filename = filename;
  return out;
}

export async function convertUrl(
  fetchFn: FetchFn,
  config: DocmarkConfig,
  options: ConvertUrlOptions,
): Promise<unknown> {
  return callApi(fetchFn, config, "/convert/url", {
    url: requireNonEmpty(options.url, "url"),
  });
}

export async function convertBase64(
  fetchFn: FetchFn,
  config: DocmarkConfig,
  options: ConvertBase64Options,
): Promise<unknown> {
  const body: Record<string, unknown> = {
    content_base64: requireNonEmpty(options.content_base64, "content_base64"),
  };
  const filename = optionalString(options.filename, "filename");
  if (filename) body.filename = filename;
  return callApi(fetchFn, config, "/convert/base64", body);
}

export async function convertBatch(
  fetchFn: FetchFn,
  config: DocmarkConfig,
  options: ConvertBatchOptions,
): Promise<unknown> {
  if (!Array.isArray(options.items)) throw new Error("items must be an array");
  if (options.items.length < MIN_BATCH_ITEMS || options.items.length > MAX_BATCH_ITEMS) {
    throw new Error(
      `items must contain between ${MIN_BATCH_ITEMS} and ${MAX_BATCH_ITEMS} items (got ${options.items.length})`,
    );
  }
  const items = options.items.map((item, i) => checkedBatchItem(item, i));
  return callApi(fetchFn, config, "/convert/batch", { items });
}

export async function listSupportedFormats(
  fetchFn: FetchFn,
  config: DocmarkConfig,
): Promise<unknown> {
  return callApi(fetchFn, config, "/formats", {});
}

export async function usageStatus(
  fetchFn: FetchFn,
  config: DocmarkConfig,
): Promise<unknown> {
  return callApi(fetchFn, config, "/usage", {});
}

/** Render a payload as the text block MCP clients show, preserving upstream payloads as-is. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
