import { extractJobLinksFromPage } from "../extractors/listing.ts";
import type { HostProfile, JobUrlRecord } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { appendJsonl } from "../utils/jsonl.ts";
import {
  canonicalDetailUrl,
  canonicalizeUrl,
  hasBlockedPath,
  safeParseUrl,
} from "../utils/url.ts";
import {
  generateListingTemplates,
  templateFromUrl,
  type ListingTemplate,
} from "./generate-listings.ts";
import {
  appendReject,
  nowIso,
  type RuntimeConfig,
} from "./runtime.ts";

export interface DiscoveryResult {
  jobUrls: JobUrlRecord[];
  reachableSeedDetailUrls: string[];
}

function isListingTemplate(
  value: ListingTemplate | null,
): value is ListingTemplate {
  return Boolean(value);
}

export function buildGeneratedPageUrl(
  templateUrl: string,
  offset: number,
  paginationEnabled: boolean,
): string {
  if (!paginationEnabled) return templateUrl;

  const parsed = safeParseUrl(templateUrl);
  if (!parsed) return templateUrl;

  parsed.searchParams.set("jobOffset", String(Math.max(0, offset)));

  return (
    canonicalizeUrl(parsed.toString(), undefined, true) ?? parsed.toString()
  );
}

function collectListingTemplates(
  config: RuntimeConfig,
  profile: HostProfile,
): ListingTemplate[] {
  const seeded = profile.reachableListingUrls
    .map((url) => templateFromUrl(url))
    .filter(isListingTemplate);

  if (config.profileSourceMode !== "generate") {
    return seeded;
  }

  const generated = generateListingTemplates(
    profile,
    config.generateMaxTemplates,
  );
  const merged = new Map<string, ListingTemplate>();

  for (const template of [...seeded, ...generated]) {
    if (!merged.has(template.url)) {
      merged.set(template.url, template);
    }
  }

  return Array.from(merged.values());
}

/**
 * Crawls a listing template and collects job URLs. Handles pagination. Returns when all pages are visited or when the total number of results is known and the current offset is greater than or equal to the total number of results.
 * @param config - The runtime configuration.
 * @param profile - The host profile.
 * @param template - The listing template.
 * @param globalSeen - A set of seen job detail URLs.
 * @param records - The job URL records to append.
 */
async function crawlListingTemplate(
  config: RuntimeConfig,
  profile: HostProfile,
  template: ListingTemplate,
  globalSeen: Set<string>,
  records: JobUrlRecord[],
): Promise<void> {
  const paginationEnabled =
    config.profileSourceMode === "generate" && template.supportsPagination;
  const maxPages = paginationEnabled ? config.generateMaxPages : 1;
  let emptyPages = 0;
  let currentOffset = 0;
  let currentOffsetStep = config.generateOffsetStep;
  let knownTotalResults: number | undefined;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const pageUrl = buildGeneratedPageUrl(
      template.url,
      currentOffset,
      paginationEnabled,
    );

    try {
      const response = await fetch(pageUrl, {
        redirect: "follow",
        headers: {
          "user-agent": config.userAgent,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
        },
      });

      if (!response.ok) {
        if (pageIndex === 0) {
          await appendReject(config, {
            stage: "discovery",
            host: profile.host,
            url: pageUrl,
            reason: "listing_unreachable",
            httpStatus: response.status,
          });
        }
        break;
      }

      const body = await response.text();
      const extraction = extractJobLinksFromPage(
        pageUrl,
        body,
        response.headers.get("content-type"),
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

      const templates = collectListingTemplates(config, profile);
      for (const template of templates) {
        await crawlListingTemplate(
          config,
          profile,
          template,
          globalSeen,
          allRecords,
        );
      }
    },
  );

  for (const record of allRecords) {
    await appendJsonl(config.jobUrlsPath, record);
  }

  return {
    jobUrls: allRecords,
    reachableSeedDetailUrls: Array.from(reachableSeedDetails),
  };
}
