import type {
  CliArgs,
  DetailsCliArgs,
  DiscoverCliArgs,
  ProfileCliArgs,
  ProfileSourceMode,
} from "../types/index.ts";

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
      continue;
    }

    if (token.startsWith("--profile-source-mode=")) {
      args.profileSourceMode = parseProfileSourceMode(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--host-profiles-file=")) {
      const value = token.split("=")[1]?.trim();
      if (value) args.hostProfilesFile = value;
    }
  }

  return args;
}

export function parseProfileArgs(argv: string[]): ProfileCliArgs {
  const args: ProfileCliArgs = {
    help: argv.includes("--help") || argv.includes("-h"),
    freshRun: argv.includes("--fresh-run"),
  };

  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit-hosts=")) {
      args.limitHosts = parsePositiveInt(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--host-profiles-file=")) {
      const value = token.split("=")[1]?.trim();
      if (value) args.hostProfilesFile = value;
      continue;
    }

    if (token.startsWith("--input-urls-file=")) {
      const value = token.split("=")[1]?.trim();
      if (value) args.inputUrlsFile = value;
    }
  }

  return args;
}

export function parseDiscoverArgs(argv: string[]): DiscoverCliArgs {
  const args: DiscoverCliArgs = {
    help: argv.includes("--help") || argv.includes("-h"),
  };

  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit-hosts=")) {
      args.limitHosts = parsePositiveInt(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--profile-source-mode=")) {
      args.profileSourceMode = parseProfileSourceMode(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--host-profiles-file=")) {
      const value = token.split("=")[1]?.trim();
      if (value) args.hostProfilesFile = value;
    }
  }

  return args;
}

export function parseDetailsArgs(argv: string[]): DetailsCliArgs {
  const args: DetailsCliArgs = {
    help: argv.includes("--help") || argv.includes("-h"),
    freshRun: argv.includes("--fresh-run"),
  };

  for (const token of argv.slice(2)) {
    if (token.startsWith("--limit-jobs=")) {
      args.limitJobs = parsePositiveInt(token.split("=")[1]);
      continue;
    }

    if (token.startsWith("--job-urls-file=")) {
      const value = token.split("=")[1]?.trim();
      if (value) args.jobUrlsFile = value;
    }
  }

  return args;
}

function parseProfileSourceMode(
  raw: string | undefined,
): ProfileSourceMode | undefined {
  if (raw === "seeded" || raw === "generate") return raw;
  return undefined;
}

export function printUsage(): void {
  console.log(`
Usage:
  bun run index.ts [options]

Options:
  --limit-hosts=<n>
  --limit-jobs=<n>
  --profile-source-mode=seeded|generate
  --host-profiles-file=<path>
  -h, --help
`);
}

export function printProfileUsage(): void {
  console.log(`
Usage:
  bun run profile [options]

Options:
  --limit-hosts=<n>
  --input-urls-file=<path>
  --host-profiles-file=<path>
  --fresh-run
  -h, --help
`);
}

export function printDiscoverUsage(): void {
  console.log(`
Usage:
  bun run discover [options]

Options:
  --limit-hosts=<n>
  --profile-source-mode=seeded|generate
  --host-profiles-file=<path>
  -h, --help
`);
}

export function printDetailsUsage(): void {
  console.log(`
Usage:
  bun run details [options]

Options:
  --job-urls-file=<path>
  --limit-jobs=<n>
  --fresh-run
  -h, --help
`);
}
