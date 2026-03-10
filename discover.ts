import { discoverMain } from "./src/cli/discover-main.ts";

discoverMain(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Discovery run failed: ${message}`);
  process.exitCode = 1;
});
