import { detailsMain } from "./src/cli/details-main.ts";

detailsMain(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Details run failed: ${message}`);
  process.exitCode = 1;
});
