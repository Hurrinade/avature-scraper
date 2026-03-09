import type { SeedHost } from "../types/index.ts";
import { readLines } from "../utils/fs.ts";
import {
  canonicalDetailUrl,
  canonicalizeUrl,
  extractHost,
  hasBlockedPath,
  isLikelyJobDetailUrl,
} from "../utils/url.ts";
import { appendReject, type RuntimeConfig } from "./runtime.ts";

interface SeedAccumulator {
  candidateUrls: Set<string>;
  seededDetailUrls: Set<string>;
}

// Stage 1: read raw seed URLs and produce clean host buckets.
export async function collectSeedHosts(
  config: RuntimeConfig,
): Promise<SeedHost[]> {
  const hosts = new Map<string, SeedAccumulator>();

  for await (const { line } of readLines(config.inputUrlsFile)) {
    const raw = line.trim();
    if (!raw) continue;

    // Normalize each seed URL once so downstream logic operates on stable values.
    const canonical = canonicalizeUrl(raw, undefined, false);
    if (!canonical) {
      await appendReject(config, {
        stage: "seeds",
        url: raw,
        reason: "invalid_url",
      });
      continue;
    }

    // Drop login/error pages early to keep the crawl focused on useful content.
    if (hasBlockedPath(canonical)) {
      await appendReject(config, {
        stage: "seeds",
        url: canonical,
        reason: "filtered_login_or_error",
      });
      continue;
    }

    const host = extractHost(canonical);
    if (!host) {
      await appendReject(config, {
        stage: "seeds",
        url: canonical,
        reason: "missing_host",
      });
      continue;
    }

    let acc = hosts.get(host);
    if (!acc) {
      acc = {
        candidateUrls: new Set<string>(),
        seededDetailUrls: new Set<string>(),
      };
      hosts.set(host, acc);
    }

    acc.candidateUrls.add(canonical);

    // Keep already-known detail URLs so we can fetch them later even if discovery misses them.
    if (isLikelyJobDetailUrl(canonical)) {
      const detail = canonicalDetailUrl(canonical);
      if (detail) {
        acc.seededDetailUrls.add(detail);
      }
    }
  }

  const seedHosts = Array.from(hosts.entries())
    .map(([host, acc]) => ({
      host,
      candidateUrls: Array.from(acc.candidateUrls),
      seededDetailUrls: Array.from(acc.seededDetailUrls),
    }))
    .sort((a, b) => a.host.localeCompare(b.host));

  if (typeof config.limitHosts === "number") {
    return seedHosts.slice(0, config.limitHosts);
  }

  return seedHosts;
}
