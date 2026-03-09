import { main } from "./src/cli/main.ts";

main(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Scraper run failed: ${message}`);
  process.exitCode = 1;
});
