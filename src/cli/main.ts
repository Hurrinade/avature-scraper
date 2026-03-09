import { parseArgs, printUsage } from "./args.ts";
import { runScraper } from "../scraper/run.ts";

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return;
  }

  await runScraper({
    limitHosts: args.limitHosts,
    limitJobs: args.limitJobs,
  });
}
