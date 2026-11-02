#!/usr/bin/env node
/**
 * docmark CLI. Subcommands mirror the MCP tool names:
 *   docmark convert_url --url <url>
 *   docmark convert_base64 --content-base64 <b64> [--filename <name>]
 *   docmark convert_base64 --file <path> [--filename <name>]
 *   docmark convert_batch --items-json <json>
 *   docmark list_supported_formats
 *   docmark usage_status
 *   docmark mcp
 * Env: FILE2MARKDOWN_API_KEY (optional, Bearer when set),
 * DOCMARK_API_URL (default https://api.file2markdown.ai).
 * Exit codes: 0 success, 1 error, 2 usage.
 */
import { readFile } from "node:fs/promises";
import {
  convertBase64,
  convertBatch,
  convertUrl,
  formatPayload,
  listSupportedFormats,
  resolveConfig,
  usageStatus,
  VERSION,
} from "./docmark.js";
import type { FetchFn } from "./types.js";

const TOOLS = ["convert_url", "convert_base64", "convert_batch", "list_supported_formats", "usage_status"];

function usage(): never {
  console.error(`Usage:
  docmark convert_url --url <url>
  docmark convert_base64 --content-base64 <b64> [--filename <name>]
  docmark convert_base64 --file <path> [--filename <name>]
  docmark convert_batch --items-json <json>
  docmark list_supported_formats
  docmark usage_status
  docmark mcp
  docmark --version`);
  process.exit(2);
}
function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}
function reqFlag(rest: string[], name: string): string {
  const v = flag(rest, name);
  if (!v) usage();
  return v;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOLS.includes(cmd)) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    let out: unknown;
    switch (cmd) {
      case "convert_url":
        out = await convertUrl(fetchFn, config, { url: reqFlag(rest, "--url") });
        break;
      case "convert_base64": {
        let content = flag(rest, "--content-base64");
        const file = flag(rest, "--file");
        if (!content && file) content = (await readFile(file)).toString("base64");
        if (!content) usage();
        out = await convertBase64(fetchFn, config, { content_base64: content, filename: flag(rest, "--filename") });
        break;
      }
      case "convert_batch": {
        const raw = reqFlag(rest, "--items-json");
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { console.error("error: --items-json must be valid JSON"); process.exit(1); }
        const items = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown }).items;
        if (!Array.isArray(items)) usage();
        out = await convertBatch(fetchFn, config, { items: items as never });
        break;
      }
      case "list_supported_formats":
        out = await listSupportedFormats(fetchFn, config);
        break;
      default:
        out = await usageStatus(fetchFn, config);
        break;
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
