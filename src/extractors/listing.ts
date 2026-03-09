import { load } from "cheerio";
import {
  canonicalDetailUrl,
  hasBlockedPath,
  isLikelyJobDetailUrl,
  isLikelyListingUrl,
  safeParseUrl,
} from "../utils/url.ts";

export interface ListingExtraction {
  jobDetailUrls: string[];
  queryParamHints: string[];
  rejectedCandidates: string[];
  paginationLegend?: {
    rangeStart: number;
    rangeEnd: number;
    totalResults: number;
    pageSize: number;
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function collectStringsFromJson(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringsFromJson(item, output);
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value))
      collectStringsFromJson(entry, output);
  }
}

function extractScriptCandidates($: ReturnType<typeof load>): string[] {
  const values: string[] = [];

  $("script").each((_, element) => {
    const content = $(element).html() ?? "";
    if (!content) return;

    const directUrls = content.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [];
    values.push(...directUrls);

    const careersPaths =
      content.match(
        /\/(?:[A-Za-z0-9_\-.]+\/)*(?:careers|jobs)\/[A-Za-z0-9_\-./?=&%]+/g,
      ) ?? [];
    values.push(...careersPaths);

    try {
      const maybeJson = JSON.parse(content);
      collectStringsFromJson(maybeJson, values);
    } catch {
      // Ignore non-JSON script content.
    }
  });

  return values;
}

function normalizeCandidate(candidate: string, baseUrl: string): string | null {
  const parsed = safeParseUrl(candidate, baseUrl);
  if (!parsed) return null;
  return parsed.toString();
}

function parsePositiveInt(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

function normalizeInlineWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Extracts the pagination legend from the page.
 * @param $ - The Cheerio instance.
 * @returns The pagination legend.
 */
function extractPaginationLegend(
  $: ReturnType<typeof load>,
): ListingExtraction["paginationLegend"] {
  const legend = $(".list-controls__text__legend").first();
  if (!legend.length) return undefined;

  const text = normalizeInlineWhitespace(legend.text());
  const textMatch = /(\d+)\s*-\s*(\d+)\s*of\s*(\d+)/i.exec(text);
  if (!textMatch) return undefined;

  const rangeStart = parsePositiveInt(textMatch[1]);
  const rangeEnd = parsePositiveInt(textMatch[2]);
  const totalFromText = parsePositiveInt(textMatch[3]);
  if (!rangeStart || !rangeEnd || !totalFromText || rangeEnd < rangeStart) {
    return undefined;
  }

  const aria = normalizeInlineWhitespace(legend.attr("aria-label") ?? "");
  const ariaMatch = /(\d+)\s+results?/i.exec(aria);
  const totalFromAria = parsePositiveInt(ariaMatch?.[1]);
  const totalResults = totalFromAria ?? totalFromText;
  const pageSize = rangeEnd - rangeStart + 1;
  if (pageSize <= 0) return undefined;

  console.log("paginationLegend", {
    rangeStart,
    rangeEnd,
    totalResults,
    pageSize,
  });

  return {
    rangeStart,
    rangeEnd,
    totalResults,
    pageSize,
  };
}

export function extractJobLinksFromPage(
  baseUrl: string,
  body: string,
  contentType: string | null,
): ListingExtraction {
  const queryParamHints = new Set<string>();
  if (/joboffset/i.test(body)) queryParamHints.add("jobOffset");
  if (/jobrecordsperpage/i.test(body)) queryParamHints.add("jobRecordsPerPage");
  if (/listfiltermode/i.test(body)) queryParamHints.add("listFilterMode");

  const candidates: string[] = [];
  let paginationLegend: ListingExtraction["paginationLegend"];
  const normalizedType = (contentType ?? "").toLowerCase();

  if (normalizedType.includes("application/json")) {
    try {
      const payload = JSON.parse(body);
      collectStringsFromJson(payload, candidates);
    } catch {
      // Keep going with empty candidate set.
    }
  } else {
    const $ = load(body);
    paginationLegend = extractPaginationLegend($);

    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (href) candidates.push(href);
    });

    $("[data-url], [data-href], [data-link]").each((_, element) => {
      const value =
        $(element).attr("data-url") ??
        $(element).attr("data-href") ??
        $(element).attr("data-link");
      if (value) candidates.push(value);
    });

    candidates.push(...extractScriptCandidates($));
  }

  const details: string[] = [];
  const rejected: string[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate, baseUrl);
    if (!normalized) continue;

    const canonical = canonicalDetailUrl(normalized, baseUrl);
    if (!canonical) continue;

    const parsed = safeParseUrl(canonical);
    if (parsed) {
      for (const key of parsed.searchParams.keys()) {
        queryParamHints.add(key);
      }
    }

    if (hasBlockedPath(canonical)) {
      rejected.push(canonical);
      continue;
    }

    if (isLikelyListingUrl(canonical)) {
      rejected.push(canonical);
      continue;
    }

    if (isLikelyJobDetailUrl(canonical)) {
      details.push(canonical);
      continue;
    }

    rejected.push(canonical);
  }

  return {
    jobDetailUrls: unique(details),
    queryParamHints: unique(Array.from(queryParamHints)),
    rejectedCandidates: unique(rejected),
    paginationLegend,
  };
}
