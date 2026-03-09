import type { ParsedArgs, PipelineMode } from "../types/index.ts";

const VALID_MODES: PipelineMode[] = [
  "profile",
  "inventory",
  "details",
  "normalize",
  "all",
];

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional = argv.slice(2).find((arg) => !arg.startsWith("--"));
  const mode = VALID_MODES.includes(positional as PipelineMode)
    ? (positional as PipelineMode)
    : "all";

  let limitHosts: number | undefined;
  let limitJobs: number | undefined;

  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    if (arg.startsWith("--limit-hosts=")) {
      limitHosts = parseNumber(arg.split("=")[1]);
      continue;
    }

    if (arg.startsWith("--limit-jobs=")) {
      limitJobs = parseNumber(arg.split("=")[1]);
      continue;
    }
  }

  return {
    mode,
    limitHosts,
    limitJobs,
  };
}

export function printUsage(): void {
  console.log(`
Usage:
  bun run index.ts <mode> [options]

Modes:
  profile      Run seeds + site profiling
  inventory    Run seeds + profile + inventory extraction
  details      Run seeds + profile + inventory + job details
  normalize    Run full pipeline through normalization
  all          Run full pipeline (default)

Options:
  --limit-hosts=<n>
  --limit-jobs=<n>
`);
}
