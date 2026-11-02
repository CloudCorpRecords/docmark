# docmark — Build Report

MCP Rebuild 1000. Clean-room rebuild of
Robinhill85/file2markdown-mcp (MCP Registry rank 227, 1 star),
built from the public README spec captured in
`harness/fixtures/file2markdown-mcp-tools-original.json`. That
fixture is docs-derived: the tools are the full documented set
of 5 and the argument schemas are documented reconstructions
from the tool table and tier/limit notes — no original server
was probed. The original repo is documentation for a hosted
service; this rebuild is a forwarding client to that service.
Parity proves the rebuild matches this program's defined spec,
labelled docs-derived. Local build only — nothing pushed or
published.

Identity: repo `docmark`, npm `@reneturcios/docmark`,
MCP name `io.github.CloudCorpRecords/docmark`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `docmark: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Convert documents and URLs to
  Markdown via the hosted file2markdown service."
  = **76 chars** (≤100 ✓); npm entry carries `version: 0.1.0`;
  OCI entry `ghcr.io/cloudcorprecords/docmark:0.1.0` carries
  **no** `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/docmark"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27)
- `src/index.ts`, `src/cli.ts` (subcommands mirror the tool
  names, plus `mcp` and `--version`; exit 2 usage / 1 API error),
  `src/mcp.ts`, `src/types.ts`, `src/docmark.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/docmark.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to docmark)
- Plus `BUILD-REPORT.md` (this file) and `parity-out/`

## Tools implemented (5)

`convert_url`, `convert_base64`, `convert_batch`,
`list_supported_formats`, `usage_status` — the full documented
set as enumerated in the task spec, as recorded in the fixture
`_source`.

| Tool | Required | Optional |
| --- | --- | --- |
| `convert_url` | `url` | — |
| `convert_base64` | `content_base64` | `filename` |
| `convert_batch` | `items` (array, 2–10, each `{url}` or `{content_base64, filename}`) | — |
| `list_supported_formats` | — | — |
| `usage_status` | — | — |

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call` (batch items are zod-checked at min 2 / max 10).
- Wire shape (labelled reconstruction): POST JSON to paths under
  the API base — `/convert/url`, `/convert/base64`,
  `/convert/batch`, `/formats`, `/usage`. Base URL env
  `DOCMARK_API_URL`, default `https://api.file2markdown.ai`
  (labelled reconstruction), trailing slashes stripped.
- Auth: `FILE2MARKDOWN_API_KEY` is OPTIONAL — the free tier works
  keyless per the README. When present it is sent as
  `Authorization: Bearer <key>`; when absent no Authorization
  header is sent and no error is raised. Tests verify the Bearer
  header is sent only when the key is set.
- Output is capped at 200,000 chars by the service with a
  truncated flag — the upstream payload is surfaced as-is
  (a test returns a payload with `truncated: true` unchanged).
- Batch limits (2–10 items, each item must provide `url` or
  `content_base64`) and blank url/content checks are enforced
  locally before any request; spy-style captured-call counts in
  tests prove no fetch happens on those rejections.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch only; no live upstream call was
  made or claimed.

## Verification (foreground, exact outputs)

### 1. Build
```
$ npm run build   (tsc)
exit=0
```
`dist/` produced, including `dist/cli.js`. Local build/test used
a copied `node_modules` from builds/sociallens, per instructions.

### 2. Tests
```
$ npm test   (tsx --test test/*.test.ts)
tests 15, pass 15, fail 0
```
Covers: base-URL default/custom/trailing-slash handling and
optional-key resolution; Bearer header sent only when the key is
set and absent keyless (both directions); convert_url POST path
and body; convert_base64 body with and without filename; blank
url/content rejected before any request; upstream payload
returned as-is including the truncated flag; batch forwarding
for a mixed 2-item batch, exactly-10 accepted, 1 and 11 rejected
before any request, item with neither url nor content_base64
rejected; formats POST to /formats with empty body; usage POST
to /usage; custom base URL; HTTP 429 surfacing the upstream
message; network-failure wrapping; plain-text upstream body
returned as a string.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command prints Usage
and exits 2. MCP stdio is exercised by the parity harness
(initialize + tools/list, 5 tools).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/file2markdown-mcp-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/docmark/dist/cli.js mcp" \
    --out /tmp/docmark-parity
verdict=PASS parity_pct=100.0 original_tools=5 rebuild_tools=5 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 5/5.) The passing run wrote to
/tmp and its parity.json/parity.md were copied into
`parity-out/` and verified non-empty (1073 and 828 bytes).
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts --offline`
(exit 0), verified after generation — parses as JSON, top-level
`name` is `@reneturcios/docmark`, version `0.1.0`,
`lockfileVersion` 3, 128 package entries — then only the
lockfile was copied back.

## Gaps / honest notes

- **The conversion engine is the upstream service's; this client
  forwards.** docmark contains no PDF/DOCX/OCR/audio conversion
  code at all. Conversion quality, format coverage, tier limits,
  availability, and the 200,000-char cap are entirely the hosted
  file2markdown service's; if it is down or changes, this client
  inherits that.
- Docs-derived spec: the argument schemas, endpoint paths and
  methods, and the base URL default
  (`https://api.file2markdown.ai`) are documented reconstructions
  from the public README tool table, per the task spec — no
  original hosted service was probed, so parity proves the
  rebuild matches this program's defined spec, not a hand-probed
  original, and live wire-shape drift is unverified.
- No live call was made: every endpoint is fake-fetch tested
  only.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
- mcpaudit / mcpvet / shipcheck pre-publish gate not run (belongs
  to the publish wave).
