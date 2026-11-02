/**
 * docmark types.
 *
 * Shapes are documented reconstructions from the public
 * file2markdown tool table: a URL conversion takes a url, a direct
 * conversion takes base64 content with an optional filename, and a
 * batch takes 2–10 items each holding either a url or base64
 * content. HTTP access is described by a minimal response surface
 * so tests can inject a fake fetch and never touch the network.
 */

export interface DocmarkConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface ConvertUrlOptions {
  url: string;
}

export interface ConvertBase64Options {
  content_base64: string;
  filename?: string;
}

export interface BatchItem {
  url?: string;
  content_base64?: string;
  filename?: string;
}

export interface ConvertBatchOptions {
  items: BatchItem[];
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
