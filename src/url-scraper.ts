import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { request } from "undici";

const DEFAULT_OUTPUT_FILE = "Urls.generated.txt";
const CRTSH_ENDPOINT = "https://crt.sh/?q=%.avature.net&output=json";
const DEFAULT_CHECK_CONCURRENCY = 20;
const DEFAULT_CHECK_TIMEOUT_MS = 5000;

interface CrtShRow {
  name_value?: string;
}

interface CliArgs {
  help: boolean;
  outputFile: string;
  skipReachabilityCheck: boolean;
  checkConcurrency: number;
  checkTimeoutMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  let outputFile = DEFAULT_OUTPUT_FILE;
  let skipReachabilityCheck = false;
  let checkConcurrency = DEFAULT_CHECK_CONCURRENCY;
  let checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS;
  const help = argv.includes("--help") || argv.includes("-h");

  const toPositiveInt = (value: string | undefined): number | null => {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  };

  for (const token of argv.slice(2)) {
    if (token.startsWith("--output=")) {
      const value = token.split("=")[1]?.trim();
      if (value) outputFile = value;
      continue;
    }

    if (token === "--skip-reachability-check") {
      skipReachabilityCheck = true;
      continue;
    }

    if (token.startsWith("--check-concurrency=")) {
      const parsed = toPositiveInt(token.split("=")[1]?.trim());
      if (parsed) checkConcurrency = parsed;
      continue;
    }

    if (token.startsWith("--check-timeout-ms=")) {
      const parsed = toPositiveInt(token.split("=")[1]?.trim());
      if (parsed) checkTimeoutMs = parsed;
    }
  }

  return {
    help,
    outputFile,
    skipReachabilityCheck,
    checkConcurrency,
    checkTimeoutMs,
  };
}

function printUsage(): void {
  console.log(`
Usage:
  bun run src/url-scraper.ts [options]

Options:
  --output=<path>   Output file for generated career URLs
  --skip-reachability-check
  --check-concurrency=<n>
  --check-timeout-ms=<n>
  -h, --help
`);
}

function normalizeAvatureDomain(raw: string): string | null {
  const candidate = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate) return null;
  if (!candidate.endsWith(".avature.net")) return null;
  if (candidate.includes("*")) return null;
  if (!/^[a-z0-9.-]+$/.test(candidate)) return null;
  if (candidate.includes("..")) return null;
  return candidate;
}

async function fetchAvatureSubdomains(): Promise<string[]> {
  const { statusCode, body } = await request(CRTSH_ENDPOINT, {
    method: "GET",
    signal: AbortSignal.timeout(15000),
    headers: {
      accept: "application/json",
    },
  });
  const responseText = await body.text();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`ct_fetch_failed_status_${statusCode}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error("ct_fetch_invalid_json");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("ct_fetch_invalid_shape");
  }

  const domains = new Set<string>();

  for (const row of parsed as CrtShRow[]) {
    if (typeof row.name_value !== "string" || !row.name_value.trim()) continue;
    const names = row.name_value.split("\n");

    for (const n of names) {
      const candidate = normalizeAvatureDomain(n);
      if (candidate) {
        domains.add(candidate);
      }
    }
  }

  return Array.from(domains).sort((a, b) => a.localeCompare(b));
}

function toCareerUrls(domains: string[]): string[] {
  return domains.map((d) => `https://${d}/careers`);
}

async function isReachableCareerUrl(
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  let currentUrl = url;
  const maxRedirects = 5;

  try {
    for (let i = 0; i <= maxRedirects; i += 1) {
      const { statusCode, body, headers } = await request(currentUrl, {
        method: "GET",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (body.dump) {
        await body.dump();
      }

      const locationHeader = headers.location;
      const location = Array.isArray(locationHeader)
        ? locationHeader[0]
        : locationHeader;
      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        typeof location === "string" &&
        location.trim()
      ) {
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      return statusCode >= 200 && statusCode < 400;
    }

    return false;
  } catch {
    return false;
  }
}

async function filterReachableCareerUrls(
  urls: string[],
  options: { concurrency: number; timeoutMs: number },
): Promise<string[]> {
  if (urls.length === 0) return [];

  const limit = pLimit(Math.max(1, Math.min(options.concurrency, urls.length)));
  const checks = await Promise.all(
    urls.map((url) =>
      limit(async () => ({
        url,
        ok: await isReachableCareerUrl(url, options.timeoutMs),
      })),
    ),
  );

  return checks.filter((item) => item.ok).map((item) => item.url);
}

async function writeUrlsToFile(
  outputFile: string,
  urls: string[],
): Promise<void> {
  const absoluteOutput = path.resolve(process.cwd(), outputFile);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  const content = urls.join("\n");
  await writeFile(absoluteOutput, `${content}\n`, "utf8");
  console.log(`saved ${urls.length} URLs to ${absoluteOutput}`);
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  const domains = await fetchAvatureSubdomains();

  console.log("subdomains found:", domains.length);

  const rawCareerPages = toCareerUrls(domains);
  const careerPages = args.skipReachabilityCheck
    ? rawCareerPages
    : await filterReachableCareerUrls(rawCareerPages, {
        concurrency: args.checkConcurrency,
        timeoutMs: args.checkTimeoutMs,
      });

  if (!args.skipReachabilityCheck) {
    console.log(
      "reachable career URLs:",
      `${careerPages.length}/${rawCareerPages.length}`,
    );
  }

  await writeUrlsToFile(args.outputFile, careerPages);

  console.log("sample:", careerPages.slice(0, 20));
}

main(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`URL scraper failed: ${message}`);
  process.exitCode = 1;
});
