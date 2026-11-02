# docmark

docmark is a local stdio front end for a hosted document-to-Markdown
conversion service. Give it a public URL, the base64 contents of a
file, or a small batch of either, and it asks the hosted service to
do the conversion and hands the Markdown back.

docmark does not convert anything itself. Each tool call is
forwarded as a JSON POST to the hosted file2markdown API, and the
upstream payload is returned as-is — including the service's
`truncated` flag when output reaches its 200,000-character cap.
Conversion quality, supported-format coverage, availability, and
tier limits are the hosted service's.

Documented input kinds include PDF, DOCX, PPTX, XLSX, CSV, JSON,
XML, HTML, EPUB, images (with OCR), audio, and ZIP archives. Call
`list_supported_formats` for the live list, per-tier limits, and
which features need Pro.

`FILE2MARKDOWN_API_KEY` is optional: the free tier works keyless.
When a key is set it is sent as `Authorization: Bearer <key>`;
when it is absent no Authorization header is sent. `DOCMARK_API_URL`
overrides the API base (default `https://api.file2markdown.ai`,
a labelled reconstruction of the wire shape).

Batch conversions take 2–10 items per call, enforced locally
before anything is sent. Each item is either `{url}` or
`{content_base64, filename}`.

## Install

```bash
npx @reneturcios/docmark convert_url --url https://example.com/report.pdf
docker run -i ghcr.io/cloudcorprecords/docmark
```

## CLI

```bash
docmark convert_url --url https://example.com/report.pdf
docmark convert_base64 --content-base64 aGVsbG8= --filename note.txt
docmark convert_base64 --file ./report.pdf
docmark convert_batch --items-json '[{"url":"https://example.com/a.pdf"},{"content_base64":"eA==","filename":"x.txt"}]'
docmark list_supported_formats
docmark usage_status
docmark --version
```

Exit codes: `0` success, `1` upstream or validation error, `2` usage error.

## MCP server

```bash
npx -y @reneturcios/docmark mcp
```

```json
{
  "mcpServers": {
    "docmark": {
      "command": "npx",
      "args": ["-y", "@reneturcios/docmark", "mcp"],
      "env": { "FILE2MARKDOWN_API_KEY": "your-key-if-you-have-one" }
    }
  }
}
```

The `env` block is optional — omit it for the keyless free tier.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `convert_url` | `url` (string, required) | The upstream conversion of the page or document at that URL. |
| `convert_base64` | `content_base64` (string, required), `filename` (string, optional) | The upstream conversion of the supplied file contents. |
| `convert_batch` | `items` (array, required, 2–10 items, each `{url}` or `{content_base64, filename}`) | Per-item upstream results. |
| `list_supported_formats` | — | Formats, per-tier limits, and what requires Pro, per the service. |
| `usage_status` | — | The caller's tier and remaining conversions for today. |

Upstream failures — HTTP errors and unreachable hosts — are
reported as tool errors with the underlying message.

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

Tests run entirely on fake-fetch fixtures; no network is used and
no live call to the hosted service is made.

## License

MIT — see `LICENSE`.
