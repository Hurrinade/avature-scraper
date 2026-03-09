import { request } from "undici";

export interface HttpRequestResult {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  bodyText?: string;
}

export type HttpRequestFn = (
  url: string,
  userAgent: string,
  readBody: boolean,
) => Promise<HttpRequestResult>;

export async function performHttpRequest(
  url: string,
  userAgent: string,
  readBody: boolean,
  requestFn?: HttpRequestFn,
): Promise<HttpRequestResult> {
  if (requestFn) {
    return requestFn(url, userAgent, readBody);
  }

  const { body, statusCode, headers } = await request(url, {
    method: "GET",
    headers: {
      "user-agent": userAgent,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    },
  });

  if (readBody) {
    return {
      statusCode,
      headers,
      bodyText: await body.text(),
    };
  }

  if (body?.dump) {
    await body.dump();
  }

  return {
    statusCode,
    headers,
  };
}

export function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const key = name.toLowerCase();
  const value = headers[key];
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}
