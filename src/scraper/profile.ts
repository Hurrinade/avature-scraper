import type { HostProfile, SeedHost } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { fetchWithRetry } from "../utils/fetchWithRetry.ts";
import {
  buildHostFallbackUrls,
  canonicalDetailUrl,
  extractQueryParamKeys,
  isLikelyJobDetailUrl,
  isLikelyListingUrl,
} from "../utils/url.ts";
import {
  appendReject,
  fetchOptions,
  nowIso,
  type RuntimeConfig,
} from "./runtime.ts";

async function profileHost(
  config: RuntimeConfig,
  seedHost: SeedHost,
): Promise<HostProfile> {
  // Mix explicit seed URLs with known Avature fallback paths per host.
  const candidates = Array.from(
    new Set([
      ...seedHost.candidateUrls,
      ...buildHostFallbackUrls(seedHost.host),
    ]),
  );

  const reachableListings = new Set<string>();
  const reachableSeedDetails = new Set<string>();
  const queryParamKeys = new Set<string>();

  let blockedResponses = 0;

  for (const candidate of candidates) {
    // Capture query keys from the URL itself so discovery can reuse them later.
    for (const key of extractQueryParamKeys(candidate)) {
      queryParamKeys.add(key);
    }

    try {
      const response = await fetchWithRetry(candidate, fetchOptions(config));

      if (response.status === 403 || response.status === 429) {
        blockedResponses += 1;
      }

      if (!response.ok) {
        await appendReject(config, {
          stage: "profile",
          host: seedHost.host,
          url: candidate,
          reason: "unreachable_candidate",
          httpStatus: response.status,
        });
        continue;
      }

      const body = await response.text();
      // Capture query keys hinted by page content (common Avature pagination patterns).
      if (/joboffset/i.test(body)) queryParamKeys.add("jobOffset");
      if (/jobrecordsperpage/i.test(body))
        queryParamKeys.add("jobRecordsPerPage");
      if (/listfiltermode/i.test(body)) queryParamKeys.add("listFilterMode");

      // Check if candidate is a listing url
      if (isLikelyListingUrl(candidate)) {
        reachableListings.add(candidate);
      }

      // Check if candidate is a job detail url
      if (isLikelyJobDetailUrl(candidate)) {
        const canonical = canonicalDetailUrl(candidate);
        if (canonical) {
          reachableSeedDetails.add(canonical);
        }
      }
    } catch {
      await appendReject(config, {
        stage: "profile",
        host: seedHost.host,
        url: candidate,
        reason: "fetch_failed",
      });
    }
  }

  const hasReachable =
    reachableListings.size > 0 || reachableSeedDetails.size > 0;
  // A host is considered blocked only when we observed block statuses and found nothing reachable.
  const reachability: HostProfile["reachability"] = hasReachable
    ? "reachable"
    : blockedResponses > 0
      ? "blocked"
      : "unreachable";

  if (reachability !== "reachable") {
    await appendReject(config, {
      stage: "profile",
      host: seedHost.host,
      url: `https://${seedHost.host}`,
      reason: `host_${reachability}`,
    });
  }

  return {
    host: seedHost.host,
    reachability,
    candidateCount: candidates.length,
    reachableListingUrls: Array.from(reachableListings),
    reachableSeedDetailUrls: Array.from(reachableSeedDetails),
    queryParamKeys: Array.from(queryParamKeys).sort(),
    checkedAt: nowIso(),
  };
}

// Stage 2: validate each host and capture reusable listing/query patterns.
export async function profileHosts(
  config: RuntimeConfig,
  seedHosts: SeedHost[],
): Promise<HostProfile[]> {
  return mapWithConcurrency(
    seedHosts,
    config.profileConcurrency,
    async (host) => profileHost(config, host),
  );
}
