const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^source$/i,
  /^tags$/i,
  /^ref$/i,
  /^fbclid$/i,
  /^gclid$/i,
];

const LISTING_HINTS = [/\/careers\b/i, /searchjobs/i];
const DETAIL_HINTS = [
  /jobdetail/i,
  /jobdetails/i,
  /requisition/i,
  /vacancy/i,
  /opportunity/i,
  /position/i,
  /posting/i,
];

export function safeParseUrl(raw: string, baseUrl?: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed);
  } catch {
    if (baseUrl) return null;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) {
      return null;
    }

    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function hasCareersPath(raw: string): boolean {
  const parsed = safeParseUrl(raw);
  if (!parsed) return false;

  // Accept /careers and any path where "careers" is a full segment (e.g. /en_US/careers/...).
  return /(?:^|\/)careers(?:\/|$)/i.test(parsed.pathname);
}

// Block paths outside careers scope and explicit careers login/error endpoints.
export function hasBlockedPath(raw: string): boolean {
  const parsed = safeParseUrl(raw);
  if (!parsed) return false;
  const path = parsed.pathname.toLowerCase();

  return (
    !hasCareersPath(raw) ||
    /(?:^|\/)careers\/(?:login|error)(?:\/|$)/i.test(path)
  );
}

export function canonicalizeUrl(
  raw: string,
  baseUrl?: string,
  dropTrackingParams = true,
): string | null {
  const parsed = safeParseUrl(raw, baseUrl);
  if (!parsed) return null;

  if (!/^https?:$/i.test(parsed.protocol)) {
    return null;
  }

  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = normalizeHost(parsed.hostname);

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  const kept = new URLSearchParams();
  const keys = Array.from(
    new Set(Array.from(parsed.searchParams.keys())),
  ).sort();
  for (const key of keys) {
    if (
      dropTrackingParams &&
      TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))
    ) {
      continue;
    }

    const values = parsed.searchParams
      .getAll(key)
      .map((value) => value.trim())
      .filter(Boolean)
      .sort();

    for (const value of values) {
      kept.append(key, value);
    }
  }

  parsed.search = kept.toString() ? `?${kept.toString()}` : "";
  parsed.hash = "";

  return parsed.toString();
}

export function extractHost(raw: string): string | null {
  const parsed = safeParseUrl(raw);
  if (!parsed) return null;
  return normalizeHost(parsed.hostname);
}

export function canonicalDetailUrl(
  raw: string,
  baseUrl?: string,
): string | null {
  return canonicalizeUrl(raw, baseUrl, true);
}

export function isLikelyListingUrl(raw: string): boolean {
  const parsed = safeParseUrl(raw);
  if (!parsed) return false;

  const full = `${parsed.pathname}${parsed.search}`.toLowerCase();
  if (hasBlockedPath(parsed.toString())) return false;
  if (/jobdetail|jobdetails/.test(full)) return false;

  return LISTING_HINTS.some((pattern) => pattern.test(full));
}

export function isLikelyJobDetailUrl(raw: string): boolean {
  const parsed = safeParseUrl(raw);
  if (!parsed) return false;

  const path = parsed.pathname.toLowerCase();
  if (hasBlockedPath(parsed.toString())) return false;
  if (/searchjobs/.test(path)) return false;

  if (
    parsed.searchParams.has("jobOffset") ||
    parsed.searchParams.has("jobRecordsPerPage")
  ) {
    return false;
  }

  if (
    parsed.searchParams.has("jobId") ||
    parsed.searchParams.has("jobid") ||
    parsed.searchParams.has("reqId") ||
    parsed.searchParams.has("requisitionId")
  ) {
    return true;
  }

  if (DETAIL_HINTS.some((pattern) => pattern.test(path))) {
    return true;
  }

  return /\/careers\/[^/?#]*\d[^/?#]*$/.test(path);
}

export function extractQueryParamKeys(raw: string): string[] {
  const parsed = safeParseUrl(raw);
  if (!parsed) return [];
  return Array.from(new Set(Array.from(parsed.searchParams.keys())));
}

function ensureTrailingSlash(pathname: string): string {
  if (!pathname.startsWith("/")) return `/${pathname}/`;
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function normalizeProfilePath(raw: string): string | null {
  const parsed = safeParseUrl(raw);
  if (!parsed) return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const lower = segments.map((segment) => segment.toLowerCase());
  const detailIndex = lower.findIndex(
    (segment) => segment === "jobdetail" || segment === "jobdetails",
  );
  if (detailIndex >= 0) {
    return ensureTrailingSlash(`/${segments.slice(0, detailIndex + 1).join("/")}`);
  }

  const searchJobsIndex = lower.findIndex((segment) => segment === "searchjobs");
  if (searchJobsIndex >= 0) {
    return ensureTrailingSlash(
      `/${segments.slice(0, searchJobsIndex + 1).join("/")}`,
    );
  }

  return ensureTrailingSlash(parsed.pathname);
}
