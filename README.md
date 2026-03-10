# Avature Scraper (Single-Run Refactor)

Minimal Bun + TypeScript scraper that follows `my-plan.md`.

## Flow

1. Run standalone profiling to generate host profiles from `Urls.txt`.
2. Run discovery-only step to generate `job_urls.jsonl` from host profiles.
3. Run details-only step to fetch/parse jobs from `job_urls.jsonl`.
4. Optional: run the combined scraper command (backward-compatible full run).

## Usage

```bash
# 1) Optional: discover additional Avature career seed URLs from crt.sh
bun run url-scraper                             # writes Urls.generated.txt
bun run url-scraper --output=Urls.txt          # overwrite seed file directly

# 2) Start with profiling
bun run profile
bun run profile --fresh-run # Run with file cleanup

# 3) Run discovery for job detail URLs
# generate = host-level SearchJobs offset pagination
# seeded = only crawl validated seeded listing URLs
# Discovery-only (overwrites output/job_urls.jsonl)
bun run discover --profile-source-mode=seeded
bun run discover --profile-source-mode=generate

# 4) Extract job details from discovered URLs
# Details-only (reads output/job_urls.jsonl by default)
bun run details
bun run details --job-urls-file=output/job_urls.jsonl

# Details-only fresh restart (clears jobs + detail checkpoint)
bun run details --fresh-run
```

## URL Scraper (CT-based seed generation)

`bun run url-scraper` queries Certificate Transparency logs from `crt.sh` for `*.avature.net`, extracts hostnames, then writes candidate `https://<host>/careers` URLs to a file.

- Default output: `Urls.generated.txt`
- Custom output: `bun run url-scraper --output=Urls.txt`
- By default it excludes wildcard hosts (like `*.avature.net`) and saves only reachable `https://<host>/careers` URLs
- Skip reachability filtering: `bun run url-scraper --skip-reachability-check`
- Tune checks: `--check-concurrency=<n> --check-timeout-ms=<n>`
- Help: `bun run url-scraper --help`

Recommended usage:

1. Generate into `Urls.generated.txt`.
2. Review or merge into your main `Urls.txt`.
3. Run `bun run profile` to validate reachable hosts/URLs before discovery.

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
