import { load } from "cheerio";
import type { JobOutput } from "../types/index.ts";
import { cleanTextFromHtml, normalizeWhitespace } from "../utils/text.ts";
import { canonicalDetailUrl, safeParseUrl } from "../utils/url.ts";

function normalizeMaybe(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeWhitespace(value);
  return normalized || undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeMaybe(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function extractDescriptionHtml(html: string): string | undefined {
  const $ = load(html);
  const selectors = [
    "#job-description",
    "[id*='job-description']",
    "[class*='job-description']",
    "[id*='description']",
    "[class*='description']",
    "article",
    "main",
  ];

  let winner = "";
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const block = $(element).html()?.trim() ?? "";
      if (block.length > winner.length) {
        winner = block;
      }
    });

    if (winner.length > 120) break;
  }

  return winner.length > 20 ? winner : undefined;
}

function extractMetadata($: ReturnType<typeof load>): Record<string, string | string[] | null> {
  const metadata: Record<string, string | string[] | null> = {};

  const put = (key: string, value: string | undefined) => {
    const normalizedKey = normalizeMaybe(key)?.replace(/[:\-]\s*$/, "").toLowerCase();
    const normalizedValue = normalizeMaybe(value);
    if (!normalizedKey || !normalizedValue) return;
    if (!(normalizedKey in metadata)) {
      metadata[normalizedKey] = normalizedValue;
    }
  };

  $("dt").each((_, element) => {
    put($(element).text(), $(element).next("dd").text());
  });

  $("tr").each((_, row) => {
    const first = $(row).find("th, td").first().text();
    const second = $(row).find("td").eq(1).text();
    put(first, second);
  });

  return metadata;
}

function extractJobId(detailUrl: string, pageText: string): string | undefined {
  const parsed = safeParseUrl(detailUrl);
  if (parsed) {
    const fromQuery =
      parsed.searchParams.get("jobId") ??
      parsed.searchParams.get("jobid") ??
      parsed.searchParams.get("reqId") ??
      parsed.searchParams.get("requisitionId");
    if (fromQuery) return fromQuery;
  }

  const match =
    /(?:job\s*id|requisition\s*id|req\s*id)\s*[:#]?\s*([A-Za-z0-9\-_/.]{2,})/i.exec(pageText);
  return match?.[1];
}

function resolveApplicationUrl($: ReturnType<typeof load>, baseUrl: string): string | undefined {
  let applicationUrl: string | undefined;

  $("a[href]").each((_, element) => {
    if (applicationUrl) return;

    const label = normalizeWhitespace($(element).text()).toLowerCase();
    if (!/apply|submit/.test(label)) return;

    const href = $(element).attr("href");
    if (!href) return;

    try {
      applicationUrl = new URL(href, baseUrl).toString();
    } catch {
      applicationUrl = href;
    }
  });

  return applicationUrl;
}

export function extractJobDetail(host: string, detailUrl: string, html: string): JobOutput {
  const $ = load(html);
  const pageText = normalizeWhitespace($("body").text());

  const descriptionHtml = extractDescriptionHtml(html);
  const descriptionText = descriptionHtml
    ? cleanTextFromHtml(descriptionHtml)
    : firstNonEmpty($("main").text(), $("article").text());

  const metadata = extractMetadata($);

  const location = firstNonEmpty(
    $("[class*='location'], [id*='location']").first().text(),
    typeof metadata.location === "string" ? metadata.location : undefined,
  );

  const datePosted = firstNonEmpty(
    $("time[datetime]").first().attr("datetime"),
    $("[class*='posted'], [id*='posted'], [class*='date'], [id*='date']").first().text(),
    typeof metadata["date posted"] === "string" ? metadata["date posted"] : undefined,
  );

  const jobId = extractJobId(detailUrl, pageText);
  if (location) metadata.location = location;
  if (datePosted) metadata.datePosted = datePosted;
  if (jobId) metadata.jobId = jobId;

  const title =
    firstNonEmpty(
      $("meta[property='og:title']").attr("content"),
      $("meta[name='title']").attr("content"),
      $("h1").first().text(),
      $("title").first().text(),
    ) ?? "Untitled Job";

  const canonicalUrl = canonicalDetailUrl(detailUrl) ?? detailUrl;

  return {
    jobTitle: title,
    jobDescriptionText: descriptionText,
    jobDescriptionHtml: descriptionHtml,
    applicationUrl: resolveApplicationUrl($, canonicalUrl) ?? canonicalUrl,
    metadata,
    jobDetailUrl: canonicalUrl,
    host,
    scrapedAt: new Date().toISOString(),
  };
}
