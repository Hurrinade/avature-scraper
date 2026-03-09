import { rm } from "node:fs/promises";
import type { ParsedArgs } from "../types/index.ts";
import { getConfig, validateConfig } from "../config/index.ts";
import { createLogger } from "../utils/logger.ts";
import { ensureDir } from "../utils/fs.ts";
import { createStatsStore, persistStats } from "../output/stats.ts";
import type { PipelineContext } from "./context.ts";
import { runSeedNormalization } from "./seeds.ts";
import { runProfile } from "./profile.ts";
import { runInventory } from "./inventory.ts";
import { runDetails } from "./details.ts";
import { runNormalize } from "./normalize.ts";

async function runUpToPhase(
  context: PipelineContext,
  phase: ParsedArgs["mode"],
): Promise<void> {
  await runSeedNormalization(context);
  await runProfile(context);

  if (phase === "profile") return;

  await runInventory(context);

  if (phase === "inventory") return;

  await runDetails(context);

  if (phase === "details") return;

  if (phase === "normalize" || phase === "all") {
    await runNormalize(context);
  }
}

export async function runPipeline(args: ParsedArgs): Promise<void> {
  const config = getConfig(args);
  validateConfig(config);

  await ensureDir(config.outputDir);
  await ensureDir(config.logsDir);
  await ensureDir(config.docsDir);

  const logger = createLogger(
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error" | undefined) ?? "info",
  );

  await rm(config.errorsPath, { force: true });

  const stats = createStatsStore(args.mode);

  const context: PipelineContext = {
    config,
    logger,
    stats,
  };

  await runUpToPhase(context, args.mode);

  await persistStats(config.siteStatsPath, stats);
}
