import { extractJobLinksFromPage } from "../extractors/listing.ts";
import type { HostProfile, JobUrlRecord } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { getHeader, performHttpRequest } from "../utils/httpRequest.ts";
import { appendJsonlMany } from "../utils/jsonl.ts";
import {
  canonicalDetailUrl,
  canonicalizeUrl,
  hasBlockedPath,
  safeParseUrl,
} from "../utils/url.ts";
import { templateFromUrl } from "./generate-listings.ts";
import { appendReject, nowIso, type RuntimeConfig } from "./runtime.ts";

export interface DiscoveryResult {
  jobUrls: JobUrlRecord[];
  reachableSeedDetailUrls: string[];
}

const OFFSET_PAGINATION_PATH = "/careers/SearchJobs";

function isOffsetPaginationPath(pathname: string): boolean {
  return pathname === OFFSET_PAGINATION_PATH;
}

export function buildGeneratedPageUrl(
  templateUrl: string,
  offset: number,
  paginationEnabled: boolean,
): string {
  if (!paginationEnabled) return templateUrl;

  const parsed = safeParseUrl(templateUrl);
  if (!parsed) return templateUrl;
  if (!isOffsetPaginationPath(parsed.pathname)) return templateUrl;

  parsed.searchParams.set("jobOffset", String(Math.max(0, offset)));

  return (
    canonicalizeUrl(parsed.toString(), undefined, true) ?? parsed.toString()
  );
}

function collectListingTemplateUrls(profile: HostProfile): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const listingUrl of profile.reachableListingUrls) {
    const template = templateFromUrl(listingUrl);
    if (!template || seen.has(template.url)) continue;
    seen.add(template.url);
    urls.push(template.url);
  }

  return urls;
}

function selectHostOffsetBaseUrl(profile: HostProfile): string | null {
  for (const listingUrl of profile.reachableListingUrls) {
    const template = templateFromUrl(listingUrl);
    if (!template) continue;

    const parsed = safeParseUrl(template.url);
    if (!parsed || !isOffsetPaginationPath(parsed.pathname)) continue;

    return template.url;
  }

  return null;
}

/**
 * Crawls a listing template and collects job URLs. Handles pagination. Returns when all pages are visited or when the total number of results is known and the current offset is greater than or equal to the total number of results.
 * @param config - The runtime configuration.
 * @param profile - The host profile.
 * @param templateUrl - The listing URL to crawl.
 * @param paginationEnabled - Whether to advance by jobOffset pages.
 * @param globalSeen - A set of seen job detail URLs.
 * @param records - The job URL records to append.
 */
async function crawlListingTemplate(
  config: RuntimeConfig,
  profile: HostProfile,
  templateUrl: string,
  paginationEnabled: boolean,
  globalSeen: Set<string>,
  records: JobUrlRecord[],
): Promise<void> {
  const maxPages = paginationEnabled ? config.generateMaxPages : 1;
  let emptyPages = 0;
  let currentOffset = 0;
  let currentOffsetStep = config.generateOffsetStep;
  let knownTotalResults: number | undefined;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageUrl = buildGeneratedPageUrl(
      templateUrl,
      currentOffset,
      paginationEnabled,
    );

    try {
      const response = await performHttpRequest(
        pageUrl,
        config.userAgent,
        true,
        config.httpRequestFn,
        config.httpTimeoutMs,
      );

      if (
        response.statusCode < 200 ||
        response.statusCode >= 300 ||
        !response.bodyText
      ) {
        if (pageIndex === 0) {
          await appendReject(config, {
            stage: "discovery",
            host: profile.host,
            url: pageUrl,
            reason: "listing_unreachable",
            httpStatus: response.statusCode,
          });
        }
        break;
      }
      const extraction = extractJobLinksFromPage(
        pageUrl,
        response.bodyText,
        getHeader(response.headers, "content-type"),
      );

      // Only log rejections that match our hard filters to keep reject logs concise.
      for (const rejected of extraction.rejectedCandidates) {
        if (hasBlockedPath(rejected)) {
          await appendReject(config, {
            stage: "discovery",
            host: profile.host,
            url: rejected,
            reason: "filtered_login_or_error",
          });
        }
      }

      const pageHasAnyDetails = extraction.jobDetailUrls.length > 0;
      for (const detailUrl of extraction.jobDetailUrls) {
        const canonical = canonicalDetailUrl(detailUrl, pageUrl);
        if (!canonical || globalSeen.has(canonical)) continue;

        globalSeen.add(canonical);
        records.push({
          host: profile.host,
          listingUrl: pageUrl,
          jobDetailUrl: detailUrl,
          canonicalJobDetailUrl: canonical,
          discoveredAt: nowIso(),
        });
      }

      if (!paginationEnabled) continue;

      if (!pageHasAnyDetails) {
        emptyPages += 1;
      } else {
        emptyPages = 0;
      }

      if (emptyPages >= config.generateEmptyPageStreak) {
        break;
      }

      if (extraction.paginationLegend) {
        currentOffsetStep = extraction.paginationLegend.pageSize;
        knownTotalResults = extraction.paginationLegend.totalResults;
      }

      const nextOffset = currentOffset + currentOffsetStep;
      if (
        typeof knownTotalResults === "number" &&
        nextOffset >= knownTotalResults
      ) {
        break;
      }

      currentOffset = nextOffset;
    } catch {
      if (pageIndex === 0) {
        await appendReject(config, {
          stage: "discovery",
          host: profile.host,
          url: pageUrl,
          reason: "listing_fetch_failed",
        });
      }
      break;
    }
  }
}

// Stage 3: crawl only seeded/reachable listing URLs and collect unique job-detail URLs.
export async function discoverJobUrls(
  config: RuntimeConfig,
  profiles: HostProfile[],
): Promise<DiscoveryResult> {
  const reachableProfiles = profiles.filter(
    (profile) => profile.reachability === "reachable",
  );
  const globalSeen = new Set<string>();
  const allRecords: JobUrlRecord[] = [];
  const reachableSeedDetails = new Set<string>();

  await mapWithConcurrency(
    reachableProfiles,
    config.discoveryConcurrency,
    async (profile) => {
      for (const detail of profile.reachableSeedDetailUrls) {
        reachableSeedDetails.add(detail);
      }

      const offsetBaseUrl =
        config.profileSourceMode === "generate"
          ? selectHostOffsetBaseUrl(profile)
          : null;
      const templates = collectListingTemplateUrls(profile).filter(
        (templateUrl) => templateUrl !== offsetBaseUrl,
      );
      await mapWithConcurrency(
        templates,
        config.discoveryTemplateConcurrency,
        async (templateUrl) => {
          await crawlListingTemplate(
            config,
            profile,
            templateUrl,
            false,
            globalSeen,
            allRecords,
          );
        },
      );

      if (config.profileSourceMode !== "generate") return;
      if (!offsetBaseUrl) return;

      await crawlListingTemplate(
        config,
        profile,
        offsetBaseUrl,
        true,
        globalSeen,
        allRecords,
      );
    },
  );

  await appendJsonlMany(config.jobUrlsPath, allRecords);

  return {
    jobUrls: allRecords,
    reachableSeedDetailUrls: Array.from(reachableSeedDetails),
  };
}
