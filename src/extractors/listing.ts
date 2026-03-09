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
    for (const entry of Object.values(value)) collectStringsFromJson(entry, output);
  }
}

function extractScriptCandidates($: ReturnType<typeof load>): string[] {
  const values: string[] = [];

  $("script").each((_, element) => {
    const content = $(element).html() ?? "";
    if (!content) return;

    const directUrls = content.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [];
    values.push(...directUrls);

    const careersPaths = content.match(/\/(?:[A-Za-z0-9_\-.]+\/)*(?:careers|jobs)\/[A-Za-z0-9_\-./?=&%]+/g) ?? [];
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
  };
}
