import type { HostProfile } from "../types/index.ts";
import { canonicalizeUrl, safeParseUrl } from "../utils/url.ts";

const DEFAULT_PAGE_SIZE = 12;

export interface ListingTemplate {
  url: string;
  supportsPagination: boolean;
  pageSize: number;
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function hasPaginationHint(parsed: URL): boolean {
  const pathname = parsed.pathname.toLowerCase();
  if (pathname.includes("/searchjobs")) return true;
  if (parsed.searchParams.has("jobOffset")) return true;
  if (parsed.searchParams.has("jobRecordsPerPage")) return true;
  return false;
}

function canonicalOrNull(raw: string): string | null {
  return canonicalizeUrl(raw, undefined, true);
}

export function templateFromUrl(raw: string): ListingTemplate | null {
  const canonical = canonicalOrNull(raw);
  if (!canonical) return null;

  const parsed = safeParseUrl(canonical);
  if (!parsed) return null;

  const pageSize = parsePositiveInt(parsed.searchParams.get("jobRecordsPerPage"));

  return {
    url: canonical,
    supportsPagination: hasPaginationHint(parsed),
    pageSize: pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

function toGeneratedTemplate(source: ListingTemplate): ListingTemplate | null {
  if (!source.supportsPagination) return null;

  const parsed = safeParseUrl(source.url);
  if (!parsed) return null;

  parsed.searchParams.set("jobOffset", "0");

  const canonical = canonicalOrNull(parsed.toString());
  if (!canonical) return null;

  return {
    url: canonical,
    supportsPagination: true,
    pageSize: source.pageSize,
  };
}

export function generateListingTemplates(
  profile: HostProfile,
  maxTemplates: number,
): ListingTemplate[] {
  const generated: ListingTemplate[] = [];
  const seen = new Set<string>();

  for (const listingUrl of profile.reachableListingUrls) {
    if (generated.length >= maxTemplates) break;

    const sourceTemplate = templateFromUrl(listingUrl);
    if (!sourceTemplate) continue;

    const generatedTemplate = toGeneratedTemplate(sourceTemplate);
    if (!generatedTemplate || seen.has(generatedTemplate.url)) continue;

    seen.add(generatedTemplate.url);
    generated.push(generatedTemplate);
  }

  return generated.sort((a, b) => a.url.localeCompare(b.url));
}
