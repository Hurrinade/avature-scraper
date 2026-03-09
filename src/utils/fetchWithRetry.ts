import { sleep } from "./concurrency.ts";

export interface FetchRetryOptions {
  timeoutMs: number;
  retries: number;
  baseDelayMs: number;
  userAgent: string;
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": options.userAgent,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
          ...(init?.headers ?? {}),
        },
      });
      clearTimeout(timeout);

      if (response.status >= 500 && attempt < options.retries) {
        await sleep(options.baseDelayMs * (attempt + 1));
        continue;
      }

      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= options.retries) {
        break;
      }
      await sleep(options.baseDelayMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
