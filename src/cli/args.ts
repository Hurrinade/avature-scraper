import type { CliArgs } from "../types/index.ts";

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.floor(parsed);
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    help: argv.includes("--help") || argv.includes("-h"),
  };

  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit-hosts=")) {
      args.limitHosts = parsePositiveInt(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--limit-jobs=")) {
      args.limitJobs = parsePositiveInt(token.split("=")[1]);
    }
  }

  return args;
}

export function printUsage(): void {
  console.log(`
Usage:
  bun run index.ts [options]

Options:
  --limit-hosts=<n>
  --limit-jobs=<n>
  -h, --help
`);
}
