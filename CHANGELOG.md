# Changelog

## 0.1.0 (2026-10-27)

- Initial release.
- CLI: `docmark convert_url --url <url>`,
  `docmark convert_base64 --content-base64 <b64> [--filename <name>]`,
  `docmark convert_batch --items-json <json>`,
  `docmark list_supported_formats`, and `docmark usage_status`.
- MCP server (`docmark mcp`, stdio) with five tools matching the
  documented file2markdown surface: `convert_url`, `convert_base64`,
  `convert_batch`, `list_supported_formats`, and `usage_status`.
- Implementation forwards each call as a JSON POST to the hosted
  service API (base URL overridable with `DOCMARK_API_URL`, default
  `https://api.file2markdown.ai`). The conversion engine itself
  stays upstream; upstream payloads are returned as-is.
- `FILE2MARKDOWN_API_KEY` is optional: sent as
  `Authorization: Bearer <key>` when set; the keyless free tier is
  used when it is absent.
- Batch calls are limited to 2–10 items locally, matching the
  documented service limit.
- All HTTP goes through an injectable fetch function, so tests run
  on fixtures with no network access.
