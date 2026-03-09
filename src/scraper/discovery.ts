import { extractJobLinksFromPage } from "../extractors/listing.ts";
import type { HostProfile, JobUrlRecord } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fetchWithRetry } from "../utils/fetchWithRetry.ts";
import { appendJsonl } from "../utils/jsonl.ts";
import { canonicalDetailUrl, hasBlockedPath } from "../utils/url.ts";
import {
  appendReject,
  fetchOptions,
  nowIso,
  type RuntimeConfig,
} from "./runtime.ts";

export interface DiscoveryResult {
  jobUrls: JobUrlRecord[];
  reachableSeedDetailUrls: string[];
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

      const listingUrls = profile.reachableListingUrls;

      for (const listingUrl of listingUrls) {
        try {
          const response = await fetchWithRetry(
            listingUrl,
            fetchOptions(config),
          );

          if (!response.ok) {
            await appendReject(config, {
              stage: "discovery",
              host: profile.host,
              url: listingUrl,
              reason: "listing_unreachable",
              httpStatus: response.status,
            });
            continue;
          }

          const body = await response.text();
          const extraction = extractJobLinksFromPage(
            listingUrl,
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

          for (const detailUrl of extraction.jobDetailUrls) {
            const canonical = canonicalDetailUrl(detailUrl, listingUrl);
            if (!canonical || globalSeen.has(canonical)) continue;

            globalSeen.add(canonical);
            allRecords.push({
              host: profile.host,
              listingUrl,
              jobDetailUrl: detailUrl,
              canonicalJobDetailUrl: canonical,
              discoveredAt: nowIso(),
            });
          }
        } catch {
          await appendReject(config, {
            stage: "discovery",
            host: profile.host,
            url: listingUrl,
            reason: "listing_fetch_failed",
          });
        }
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
