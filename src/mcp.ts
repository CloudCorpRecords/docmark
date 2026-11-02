/**
 * docmark MCP server. Tools: convert_url, convert_base64,
 * convert_batch, list_supported_formats, usage_status.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call arguments. Every call is
 * forwarded to the hosted file2markdown service; see docmark.ts.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const NoArgs = z.object({});
const ConvertUrlArgs = z.object({ url: z.string() });
const ConvertBase64Args = z.object({
  content_base64: z.string(),
  filename: z.string().optional(),
});
const BatchItemArgs = z.object({
  url: z.string().optional(),
  content_base64: z.string().optional(),
  filename: z.string().optional(),
});
const ConvertBatchArgs = z.object({
  items: z.array(BatchItemArgs).min(2).max(10),
});

const TOOLS = [
  {
    name: "convert_url",
    description: "Convert a public URL (web page or document) to Markdown via the hosted service.",
    inputSchema: {
      type: "object" as const,
      properties: { url: { type: "string", description: "Public URL of the web page or document to convert to Markdown." } },
      required: ["url"],
    },
  },
  {
    name: "convert_base64",
    description: "Convert file contents supplied as base64 to Markdown via the hosted service.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content_base64: { type: "string", description: "File contents to convert, supplied as a base64-encoded string." },
        filename: { type: "string", description: "Original file name, used to detect the document format." },
      },
      required: ["content_base64"],
    },
  },
  {
    name: "convert_batch",
    description: "Convert 2 to 10 items in one call; each item is {url} or {content_base64, filename}. Returns per-item results.",
    inputSchema: {
      type: "object" as const,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              content_base64: { type: "string" },
              filename: { type: "string" },
            },
          },
          description: "Items to convert, 2 to 10 per call; each item is {url} or {content_base64, filename}.",
        },
      },
      required: ["items"],
    },
  },
  {
    name: "list_supported_formats",
    description: "List supported formats, per-tier limits, and which features require Pro.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "usage_status",
    description: "Show the caller's tier and remaining conversions for today.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}
function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

const server = new Server({ name: "docmark", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const config = resolveConfig(process.env);
  try {
    let out: unknown;
    switch (name) {
      case "convert_url": out = await convertUrl(fetchFn, config, ConvertUrlArgs.parse(args ?? {})); break;
      case "convert_base64": out = await convertBase64(fetchFn, config, ConvertBase64Args.parse(args ?? {})); break;
      case "convert_batch": out = await convertBatch(fetchFn, config, ConvertBatchArgs.parse(args ?? {})); break;
      case "list_supported_formats": NoArgs.parse(args ?? {}); out = await listSupportedFormats(fetchFn, config); break;
      case "usage_status": NoArgs.parse(args ?? {}); out = await usageStatus(fetchFn, config); break;
      default: throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
