import { parseDetailsArgs, printDetailsUsage } from "./args.ts";
import { runDetailsOnly } from "../scraper/run.ts";

export async function detailsMain(argv: string[]): Promise<void> {
  const args = parseDetailsArgs(argv);
  if (args.help) {
    printDetailsUsage();
    return;
  }

  await runDetailsOnly({
    limitJobs: args.limitJobs,
    jobUrlsFile: args.jobUrlsFile,
    freshRun: args.freshRun,
  });
}
