# Avature Scraper Important Notes

This document explains the purpose of core design decisions in the scraper and when they matter.

## 1) Structured Logger (`src/utils/logger.ts`)

Why it exists:

- Long scraping runs need searchable, machine-readable logs.
- JSON logs let you filter by `phase`, `host`, `entityId`, and `level`.
- Helps debug failures without rerunning everything.

What it gives you:

- Consistent log shape for `info`, `warn`, `error`.
- Timestamps for run timeline reconstruction.

Without it:

- Debugging is slower and ad-hoc text logs are hard to aggregate.

## 2) Error Events File (`logs/errors.jsonl`)

Why it exists:

- Scrapers must continue after partial failures.
- You still need a persistent failure ledger for follow-up fixes.

What it gives you:

- Every failure recorded with phase + entity + message + details + time.
- Easy post-run analysis (`jq`, grep, scripts).

Without it:

- You lose visibility into silent data gaps.

## 3) Checkpoints + Resume (Future Improvement, not in MVP)

Important status:

- Checkpoint/resume is intentionally **not implemented** in the current MVP.
- The current pipeline always runs fresh for the selected mode chain.

Why it is still worth adding later:

- Full runs can be long and unstable (network errors, laptop sleep, interrupts).
- Restarting from zero is expensive and can re-hit hosts unnecessarily.

What a future implementation would give:

- Track processed hosts/jobs and completed phases.
- Continue from interruption point instead of rerunning completed work.

## 4) Retry + Timeout Fetch (`src/utils/fetchWithRetry.ts`)

Why it exists:

- Remote hosts can fail transiently (timeouts, temporary 5xx).
- Scraping reliability improves significantly with bounded retries.

What it gives you:

- Request timeout per call.
- Controlled retry attempts with backoff.
- User-agent/header defaults for realistic requests.

Without it:

- Temporary network noise causes large avoidable data loss.

## 5) Per-Host Throttling (`src/utils/throttle.ts`)

Why it exists:

- Hammering one host increases risk of 429/403 blocking.
- Ethical + practical scraping requires pacing.

What it gives you:

- Minimum interval between requests to the same host.
- Better stability and fewer bans.

Without it:

- Burst traffic can reduce overall coverage.

## 6) URL Canonicalization (`src/utils/url.ts`)

Why it exists:

- Same job often appears under multiple equivalent URLs.
- Query tracking params can explode duplicate counts.

What it gives you:

- Normalized host/path/query ordering.
- Tracking param cleanup for detail URL dedupe.
- Stable keys for inventory and job identity.

Without it:

- Duplicate inflation and unstable outputs.

## 7) Normalization + Dedupe (`src/normalize/dedupe.ts`)

Why it exists:

- Final metric is unique jobs, not raw page hits.
- Avature sites can duplicate across locale/filter/entry points.

Dedupe priority:

1. `jobId`
2. canonical `detailUrl`
3. fallback hash of normalized `sourceHost + title + location`

What it gives you:

- Reproducible unique job counts.
- Cleaner downstream datasets.

Without it:

- Final output quality drops and counts are misleading.

## 7.1) SSR + Embedded State Extraction (`src/extractors/listing.ts`)

Why it exists:

- Many Avature pages render a full initial HTML/JS state on first load.
- Filtering can be client-side only, with no extra backend/XHR request.

What it gives you:

- Extracts detail links from both visible HTML links and embedded JSON script payloads.
- Better first-pass coverage on SSR-heavy portals.

Without it:

- Profiler/inventory can miss jobs that never appear as plain anchor links.

## 8) Phase-Based Pipeline (CLI modes)

Modes:

- `profile`
- `inventory`
- `details`
- `normalize`
- `all`

Why it exists:

- Lets you debug one stage without rerunning everything.
- Supports incremental development and targeted reruns.

What it gives you:

- Faster iteration loops.
- Better isolation of failures by phase.

Without it:

- Small fixes require full expensive runs.

## 9) Site Stats (`output/site_stats.json`)

Why it exists:

- You need proof of coverage quality and failure distribution.

What it gives you:

- Run-level and host-level counters (pages fetched, jobs found, extracted, duplicates, failures).
- Clear signal on where to improve parser/profile logic.

Without it:

- You can’t explain or prioritize coverage gaps.

## 10) Why JSONL Intermediates

Files:

- `output/site_profiles.jsonl`
- `output/inventory_jobs.jsonl`
- `output/jobs_raw.jsonl`

Why it exists:

- Append-friendly and robust for long runs.
- Easy to inspect partially completed runs.

What it gives you:

- Better failure recovery and streaming write behavior.

Without it:

- Large in-memory accumulation and fragile writes.

## 11) Why `Urls.txt` is Primary Input (v1)

Why it exists:

- You already have a large URL corpus; discovery is not the bottleneck right now.

What it gives you:

- Immediate focus on profiling/extraction coverage.
- Faster path to high unique-job yield.

Tradeoff:

- New-host discovery can still be added later as enrichment.

## 12) Operational Guidance

Fresh full run:

```bash
bun run index.ts all
```

Constrained debug run:

```bash
bun run index.ts all --limit-hosts=5 --limit-jobs=100
```

Recommended workflow:

1. Start with constrained run to validate behavior.
2. Run full pipeline.
3. Inspect `logs/errors.jsonl` and `output/site_stats.json`.
4. Improve selectors/profiling for top failing hosts.

## 13) Package Choices

- `cheerio`: DOM-oriented extraction is more reliable than regex-only parsing across varied templates.
- `p-limit`: trusted concurrency limiter with simpler behavior than hand-rolled worker queues.
- `zod`: enforces config shape and numeric bounds early, reducing runtime surprises from bad env values.
