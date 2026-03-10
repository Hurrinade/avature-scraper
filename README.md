# Avature Scraper (Single-Run Refactor)

Minimal Bun + TypeScript scraper that follows `my-plan.md`.

## Flow

1. Run standalone profiling to generate host profiles from `Urls.txt`.
2. Run discovery-only step to generate `job_urls.jsonl` from host profiles.
3. Run details-only step to fetch/parse jobs from `job_urls.jsonl`.
4. Optional: run the combined scraper command (backward-compatible full run).

## Usage

```bash
# Start with profiling
bun run profile
bun run profile --fresh-run # Run with file cleanup

# Then run discovery for more job details urls retrieval, generate is with offset generation (slower, using also seed urls), seed is just with urls from the initial input (like urls.txt)
# Discovery-only (overwrites output/job_urls.jsonl)
bun run discover --profile-source-mode=seeded
bun run discover --profile-source-mode=generate

# Then use details to extract job details per urls gathered before
# Details-only (reads output/job_urls.jsonl by default)
bun run details
bun run details --job-urls-file=output/job_urls.jsonl

# Details-only fresh restart (clears jobs + detail checkpoint)
bun run details --fresh-run
```

## Output Artifacts

- `output/host_profiles.json` (created by `bun run profile`)
- `output/job_urls.jsonl`
- `output/rejected_urls.jsonl`
- `output/job_detail_checkpoint.jsonl` (created by `bun run details`)
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

### [Overall plan](./my-plan.md)
