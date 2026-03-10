import { parseDiscoverArgs, printDiscoverUsage } from "./args.ts";
import { runDiscoveryOnly } from "../scraper/run.ts";

export async function discoverMain(argv: string[]): Promise<void> {
  const args = parseDiscoverArgs(argv);
  if (args.help) {
    printDiscoverUsage();
    return;
  }

  await runDiscoveryOnly({
    limitHosts: args.limitHosts,
    profileSourceMode: args.profileSourceMode,
    hostProfilesFile: args.hostProfilesFile,
  });
}
