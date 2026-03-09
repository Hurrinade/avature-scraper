/**
 * This phase is responsible for normalizing the seed URLs and creating a hosts index.
 * It also logs any errors that occur during the process.
 */

import { rm } from "node:fs/promises";
import type { HostIndexEntry } from "../types/index.ts";
import type { PipelineContext } from "./context.ts";
import { readLines, writeJsonFile } from "../utils/fs.ts";
import { canonicalSeed, extractHost, safeParseUrl } from "../utils/url.ts";
import { logError } from "./context.ts";

interface HostAccumulator {
  seedCount: number;
  candidateUrls: Set<string>;
}

export async function runSeedNormalization(
  context: PipelineContext,
): Promise<void> {
  const { config, logger, stats } = context;
  await rm(config.hostsIndexPath, { force: true });

  logger.info("phase_start", { phase: "seeds", input: config.inputUrlsFile });

  const hostMap = new Map<string, HostAccumulator>();

  try {
    for await (const { line, lineNumber } of readLines(config.inputUrlsFile)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = safeParseUrl(trimmed);
      if (!parsed) {
        stats.run.invalidUrls += 1;
        await logError(context, {
          phase: "seeds",
          entityType: "url",
          entityId: String(lineNumber),
          message: "Invalid URL in Urls.txt",
          details: trimmed,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const canonicalUrl = canonicalSeed(trimmed);
      const host = extractHost(trimmed);
      if (!canonicalUrl || !host) {
        stats.run.invalidUrls += 1;
        continue;
      }

      let acc = hostMap.get(host);
      if (!acc) {
        acc = { seedCount: 0, candidateUrls: new Set<string>() };
        hostMap.set(host, acc);
      }

      acc.seedCount += 1;
      acc.candidateUrls.add(canonicalUrl);
    }
  } catch (error) {
    await logError(context, {
      phase: "seeds",
      entityType: "system",
      entityId: "unknown",
      message: "Error during seed normalization",
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }

  const hosts: HostIndexEntry[] = Array.from(hostMap.entries())
    .map(([host, value]) => ({
      host,
      seedCount: value.seedCount,
      candidateUrls: Array.from(value.candidateUrls).sort(),
    }))
    .sort((a, b) => a.host.localeCompare(b.host));

  await writeJsonFile(config.hostsIndexPath, hosts);

  logger.info("phase_complete", {
    phase: "seeds",
    hosts: hosts.length,
    invalidUrls: stats.run.invalidUrls,
    output: config.hostsIndexPath,
  });
}
