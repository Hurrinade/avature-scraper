# Avature Scraper (Single-Run Refactor)

Minimal Bun + TypeScript scraper that follows `my-plan.md`.

## Flow

1. Run standalone profiling to generate host profiles from `Urls.txt`.
2. Run scraper with host profiles in `seeded` mode to discover/fetch details.
3. Run scraper with `generate` mode to crawl seeded + synthesized listing templates with pagination.

## Usage

```bash
bun run profile
bun run index.ts --profile-source-mode=seeded
bun run index.ts --profile-source-mode=generate
GENERATE_OFFSET_STEP=6 bun run index.ts --profile-source-mode=generate

# Speed knobs for large seed sets
SEED_PROBE_CONCURRENCY=16 SEED_PROBE_TIMEOUT_MS=4000 SEED_PROBE_RETRIES=0 bun run profile
PROFILE_CANDIDATE_CONCURRENCY=8 bun run profile
```

## Output Artifacts

- `output/host_profiles.json` (created by `bun run profile`)
- `output/job_urls.jsonl`
- `output/rejected_urls.jsonl`
- `output/jobs.json`

## Final Job Schema

Each record in `output/jobs.json` includes:

- `jobTitle`
- `jobDescriptionText`
- `jobDescriptionHtml`
- `applicationUrl`
- `metadata`
- `jobDetailUrl`
- `host`
- `scrapedAt`
