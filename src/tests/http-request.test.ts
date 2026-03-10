import { describe, expect, test } from "bun:test";
import {
  drainResponseBody,
  performHttpRequest,
} from "../utils/httpRequest.ts";
import type { RunOptions } from "../types/index.ts";

describe("http request helper", () => {
  test("uses injected request function and returns response payload", async () => {
    const requestFn: NonNullable<RunOptions["httpRequestFn"]> = async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      bodyText: "ok-body",
    });

    const response = await performHttpRequest(
      "https://example.com",
      "test-agent",
      true,
      requestFn,
      1000,
    );

    expect(response.statusCode).toBe(200);
    expect(response.bodyText).toBe("ok-body");
  });

  test("times out injected request function when over timeout", async () => {
    const slowRequestFn: NonNullable<RunOptions["httpRequestFn"]> = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        statusCode: 200,
        headers: {},
      };
    };

    await expect(
      performHttpRequest(
        "https://example.com",
        "test-agent",
        false,
        slowRequestFn,
        10,
      ),
    ).rejects.toThrow("http_request_timeout_10ms");
  });

  test("drains response body via dump when available", async () => {
    let dumped = false;
    await drainResponseBody({
      dump: async () => {
        dumped = true;
      },
    });
    expect(dumped).toBeTrue();
  });

  test("drains response body via text fallback", async () => {
    let consumed = false;
    await drainResponseBody({
      text: async () => {
        consumed = true;
        return "fallback";
      },
    });
    expect(consumed).toBeTrue();
  });
});
