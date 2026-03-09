import { parseArgs, printUsage } from "./args.ts";
import { runPipeline } from "../pipeline/run.ts";

export async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const args = parseArgs(argv);
  await runPipeline(args);
}
