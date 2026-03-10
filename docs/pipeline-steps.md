# Avature Scraper Pipeline (Step by Step)

This is the current, implementation-accurate pipeline guide.

It is aligned with the intent in [`my-plan.md`](../my-plan.md), but reflects the latest code behavior and CLI split.

## Run Modes

You can run the pipeline in independent steps:

1. `bun run profile`
2. `bun run discover --profile-source-mode=seeded|generate`
3. `bun run details`

You can also still run the combined flow:

- `bun run index.ts --profile-source-mode=seeded|generate`

## Step 1: Seeding (`seeds`)

Purpose: clean raw `Urls.txt` and prepare host buckets.

Important work:

- Read URLs line-by-line (memory-safe).
- Canonicalize URLs and normalize hosts.
- Filter noisy paths early (`/Login`, `/Error`, etc.).
- Group by host and dedupe URLs.
- Extract seeded detail URLs already present in input.
- Probe host TCP reachability before profiling.

Result:

- Unreachable hosts are dropped before profile HTTP checks.

Common reject reasons:

- `invalid_url`
- `filtered_login_or_error`
- `host_unreachable_probe`
- `skipped_unreachable_host`

## Step 2: Profiling (`profile`)

Purpose: validate host candidate URLs and build `host_profiles.json`.

Important work:

- For each seeded host, test candidate URLs concurrently.
- Classify URL reachability and host reachability (`reachable`, `blocked`, `unreachable`).
- Split reachable candidates into listing URLs and seeded detail URLs.
- Write host profile records used by later steps.

Host-pass checkpoint behavior:

- `output/host_profiles.json` is the host-pass checkpoint source.
- If a host already exists there, it is treated as passed and skipped on later profile runs.
- Skip key is host-only (not URL-change-based).
- Hosts are considered passed after completed profiling even if final status is `blocked` or `unreachable`.

Reset:

- `bun run profile --fresh-run` clears prior profile output and reprofiles all hosts.

Common reject reasons:

- `unreachable_candidate`
- `fetch_failed`
- `host_blocked`
- `host_unreachable`

## Step 3: Discovery (`discovery`)

Purpose: collect job detail URLs from profiled listing pages.

Important work:

- Load reachable hosts from `host_profiles.json`.
- Crawl listing templates and extract detail links from HTML/JSON/script content.
- Dedupe canonical detail URLs globally.
- In `generate` mode, synthesize pagination templates and iterate offsets.
- Pagination URL generation with `jobOffset` is only used for `SearchJobs` paths.

Important rule:

- Generated offset URLs are for `.../SearchJobs...` endpoints only.

Output:

- Discovery-only command (`bun run discover`) overwrites `output/job_urls.jsonl`.
- In discovery-only mode, reachable seeded detail URLs are also included so details step can consume one file.

Common reject reasons:

- `listing_unreachable`
- `listing_fetch_failed`
- `filtered_login_or_error`

## Step 4: Details Extraction (`details`)

Purpose: fetch each job detail URL and map HTML into normalized job objects.

Important work:

- Read detail URLs from `output/job_urls.jsonl` (or `--job-urls-file`).
- Fetch details concurrently.
- Extract title, description text/html, application URL, metadata, canonical detail URL.
- Merge new jobs into existing `output/jobs.json` and dedupe.

Detail checkpoint behavior:

- Uses `output/job_detail_checkpoint.jsonl`.
- Each attempted detail URL (success or fail) is checkpointed.
- Later runs skip already attempted detail URLs.

Reset:

- `bun run details --fresh-run` clears detail checkpoint and `jobs.json`.

Common reject reasons:

- `detail_unreachable`
- `detail_fetch_failed`

## Step 5: Finalization (`final`)

Purpose: produce stable deduped output.

Dedupe priority:

1. `host + jobId`
2. canonical detail URL
3. fallback hash (`host + title + location`)

Final output:

- `output/jobs.json`

## Output Files

- `output/host_profiles.json`
- `output/job_urls.jsonl`
- `output/job_detail_checkpoint.jsonl`
- `output/rejected_urls.jsonl`
- `output/jobs.json`

## Reliability Rules

- Canonicalize URLs at every stage.
- Keep host-level gating early (seeding/profiling).
- Use explicit checkpoints for resumable runs.
- Keep stage-level reject tracking for cleanup/debugging.
