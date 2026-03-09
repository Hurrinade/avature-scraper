import { parseProfileArgs, printProfileUsage } from "./args.ts";
import { runProfileBuilder } from "../scraper/run.ts";

export async function profileMain(argv: string[]): Promise<void> {
  const args = parseProfileArgs(argv);
  if (args.help) {
    printProfileUsage();
    return;
  }

  await runProfileBuilder({
    limitHosts: args.limitHosts,
    hostProfilesFile: args.hostProfilesFile,
  });
}
