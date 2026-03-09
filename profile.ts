import { profileMain } from "./src/cli/profile-main.ts";

profileMain(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Profile run failed: ${message}`);
  process.exitCode = 1;
});
