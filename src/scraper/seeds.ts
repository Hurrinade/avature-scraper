import type { SeedHost } from "../types/index.ts";
import { mapWithConcurrency } from "../utils/concurrency.ts";
import { readLines } from "../utils/fs.ts";
import {
  canonicalDetailUrl,
  canonicalizeUrl,
  hasBlockedPath,
  isLikelyJobDetailUrl,
  safeParseUrl,
} from "../utils/url.ts";
import { appendReject, type RuntimeConfig } from "./runtime.ts";
import {
  defaultPortForProtocol,
  probeHostReachabilityTcp,
} from "./tcpProbe.ts";

interface SeedAccumulator {
  candidateUrls: Set<string>;
  seededDetailUrls: Set<string>;
}

type HostProbeState = "reachable" | "unreachable";

interface ParsedSeedHost {
  host: string;
  probePort: number;
  candidateUrls: string[];
  seededDetailUrls: string[];
}

interface ProbeResult {
  host: string;
  state: HostProbeState;
}

function chooseProbePort(
  currentPort: number,
  currentProtocol: string,
  nextPort: number,
  nextProtocol: string,
): { port: number; protocol: string } {
  // Prefer HTTPS when both protocols exist for the same host.
  if (currentProtocol !== "https:" && nextProtocol === "https:") {
    return { port: nextPort, protocol: nextProtocol };
  }

  return { port: currentPort, protocol: currentProtocol };
}

async function probeHostReachability(
  config: RuntimeConfig,
  host: string,
  port: number,
): Promise<{ state: HostProbeState }> {
  const isReachable = await probeHostReachabilityTcp({
    host,
    port,
    timeoutMs: config.seedProbeTimeoutMs,
    retries: config.seedProbeRetries,
    probeFn: config.seedProbeFn,
  });
  return { state: isReachable ? "reachable" : "unreachable" };
}

async function parseSeedHostCandidates(
  config: RuntimeConfig,
): Promise<ParsedSeedHost[]> {
  const hosts = new Map<
    string,
    SeedAccumulator & {
      probePort: number;
      probeProtocol: string;
    }
  >();

  for await (const { line } of readLines(config.inputUrlsFile)) {
    const raw = line.trim();
    if (!raw) continue;

    const canonical = canonicalizeUrl(raw, undefined, false);
    if (!canonical) {
      await appendReject(config, {
        stage: "seeds",
        url: raw,
        reason: "invalid_url",
      });
      continue;
    }

    if (hasBlockedPath(canonical)) {
      await appendReject(config, {
        stage: "seeds",
        url: canonical,
        reason: "filtered_login_or_error",
      });
      continue;
    }

    const parsed = safeParseUrl(canonical);
    if (!parsed) {
      await appendReject(config, {
        stage: "seeds",
        url: canonical,
        reason: "invalid_url",
      });
      continue;
    }

    const host = parsed.hostname;
    const candidatePort = parsed.port
      ? Number(parsed.port)
      : defaultPortForProtocol(parsed.protocol);

    if (!Number.isFinite(candidatePort) || candidatePort <= 0) {
      await appendReject(config, {
        stage: "seeds",
        url: canonical,
        reason: "invalid_url",
      });
      continue;
    }

    let acc = hosts.get(host);
    if (!acc) {
      acc = {
        candidateUrls: new Set<string>(),
        seededDetailUrls: new Set<string>(),
        probePort: candidatePort,
        probeProtocol: parsed.protocol,
      };
      hosts.set(host, acc);
    } else {
      const selected = chooseProbePort(
        acc.probePort,
        acc.probeProtocol,
        candidatePort,
        parsed.protocol,
      );
      acc.probePort = selected.port;
      acc.probeProtocol = selected.protocol;
    }

    acc.candidateUrls.add(canonical);

    if (isLikelyJobDetailUrl(canonical)) {
      const detail = canonicalDetailUrl(canonical);
      if (detail) {
        acc.seededDetailUrls.add(detail);
      }
    }
  }

  return Array.from(hosts.entries())
    .map(([host, acc]) => ({
      host,
      probePort: acc.probePort,
      candidateUrls: Array.from(acc.candidateUrls),
      seededDetailUrls: Array.from(acc.seededDetailUrls),
    }))
    .sort((a, b) => a.host.localeCompare(b.host));
}

async function probeHosts(
  config: RuntimeConfig,
  parsedHosts: ParsedSeedHost[],
): Promise<Map<string, ProbeResult>> {
  const probeResults = await mapWithConcurrency(
    parsedHosts,
    config.seedProbeConcurrency,
    async (item) => {
      const probe = await probeHostReachability(
        config,
        item.host,
        item.probePort,
      );
      return {
        host: item.host,
        state: probe.state,
      } satisfies ProbeResult;
    },
  );

  return new Map(probeResults.map((result) => [result.host, result]));
}

// Stage 1: read raw seed URLs and produce clean host buckets.
export async function collectSeedHosts(
  config: RuntimeConfig,
): Promise<SeedHost[]> {
  const parsedHosts = await parseSeedHostCandidates(config);
  const probeResults = await probeHosts(config, parsedHosts);
  const seedHosts: SeedHost[] = [];

  for (const parsed of parsedHosts) {
    const probe = probeResults.get(parsed.host);
    if (!probe || probe.state === "unreachable") {
      await appendReject(config, {
        stage: "seeds",
        host: parsed.host,
        url: `https://${parsed.host}/careers`,
        reason: "host_unreachable_probe",
      });

      for (const skipped of parsed.candidateUrls) {
        await appendReject(config, {
          stage: "seeds",
          host: parsed.host,
          url: skipped,
          reason: "skipped_unreachable_host",
        });
      }

      continue;
    }

    seedHosts.push({
      host: parsed.host,
      candidateUrls: parsed.candidateUrls,
      seededDetailUrls: parsed.seededDetailUrls,
    });
  }

  if (typeof config.limitHosts === "number") {
    return seedHosts.slice(0, config.limitHosts);
  }

  return seedHosts;
}
