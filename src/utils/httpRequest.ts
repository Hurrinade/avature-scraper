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

type ResponseBodyLike = {
  dump?: () => Promise<unknown>;
  cancel?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

export async function drainResponseBody(body: ResponseBodyLike | null | undefined): Promise<void> {
  if (!body) return;

  if (typeof body.dump === "function") {
    await body.dump();
    return;
  }

  if (typeof body.cancel === "function") {
    await body.cancel();
    return;
  }

  if (typeof body.text === "function") {
    await body.text();
  }
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation();
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`http_request_timeout_${Math.floor(timeoutMs)}ms`)),
      timeoutMs,
    );

    operation()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function performHttpRequest(
  url: string,
  userAgent: string,
  readBody: boolean,
  requestFn?: HttpRequestFn,
  timeoutMs = 8000,
): Promise<HttpRequestResult> {
  if (requestFn) {
    return withTimeout(() => requestFn(url, userAgent, readBody), timeoutMs);
  }

  const { body, statusCode, headers } = await request(url, {
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
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

  await drainResponseBody(body as ResponseBodyLike);

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
