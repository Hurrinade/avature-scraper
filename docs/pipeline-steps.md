# Avature Scraper Pipeline (Step by Step)

This document explains what each pipeline step does and why each check is important for a clean, stable run.

## Step 1: Seeding (`seeds`)

Purpose: turn raw `Urls.txt` into clean host buckets before expensive scraping.

Important work:
- Read input URLs line-by-line (memory-safe for large files).
- Canonicalize URLs and normalize hosts.
- Filter hard-noise paths early (for example login/error pages).
- Group URLs by host and remove duplicates.
- Detect seeded job-detail URLs already present in input.
- Probe each host reachability first (TCP probe), in parallel.

Why this keeps it clean:
- Unreachable hosts are removed before profile/discovery work.
- Broken or noisy URLs are rejected early.
- Host-first gating prevents wasted requests later.

Reject examples:
- `invalid_url`
- `filtered_login_or_error`
- `host_unreachable_probe`
- `skipped_unreachable_host`

## Step 2: Profiling (`profile`)

Purpose: validate candidate URLs per host and build reusable host profiles.

Important work:
- For each seeded host, test all candidate URLs concurrently.
- Keep only reachable URLs (`2xx`) as valid candidates.
- Classify reachable URLs into listing URLs (for discovery) and seeded detail URLs (direct job details).
- Detect block behavior (`403`/`429`) to distinguish blocked vs unreachable hosts.
- Save per-host profile fields: reachability (`reachable`, `blocked`, `unreachable`), counters, reachable listing URLs, reachable seeded detail URLs, and check timestamp.

Why this keeps it clean:
- Discovery only runs on proven reachable hosts/URLs.
- Host profile output is deterministic input for later steps.
- Blocked hosts are tracked explicitly instead of treated as generic failures.

Reject examples:
- `unreachable_candidate`
- `fetch_failed`
- `host_blocked`
- `host_unreachable`

## Step 3: Discovery (`discovery`)

Purpose: expand from listing pages to full job-detail URL coverage.

Important work:
- Use only hosts marked `reachable` in host profiles.
- Build listing templates from profiled listing URLs.
- In `generate` mode, synthesize additional listing URLs from known patterns.
- Crawl listing pages and extract job-detail links from HTML/JSON/script content.
- Canonicalize and globally dedupe discovered job-detail URLs.
- Support pagination by changing `jobOffset` and reading pagination legend when available.
- Stop pagination safely when page limit is reached, empty-page streak is hit, or known total results are exhausted.
- Merge discovered detail URLs with reachable seeded detail URLs.

Why this keeps it clean:
- URL generation is controlled and host-specific.
- Pagination has stop conditions, so crawling does not run forever.
- Canonical dedupe prevents repeated detail fetches.

Reject examples:
- `listing_unreachable`
- `listing_fetch_failed`
- `filtered_login_or_error`

## Step 4: Detail Extraction (`details`)

Purpose: fetch each unique job-detail URL and map page HTML into structured job data.

Important work:
- Fetch detail pages concurrently.
- Require reachable detail pages (`2xx`) and non-empty body.
- Parse HTML and extract title, description text/html, application URL, and metadata (location, date posted, job ID when available).
- Canonicalize job-detail URL before storing.

Why this keeps it clean:
- Only valid detail pages become job records.
- Extraction logic is consistent across hosts.
- Canonical detail URLs improve final dedupe quality.

Reject examples:
- `detail_unreachable`
- `detail_fetch_failed`

## Step 5: Finalization (`final`)

Purpose: produce a clean final dataset.

Important work:
- Dedupe records with stable key priority: `host + jobId`, then canonical detail URL, then fallback hash (`host + title + location`).
- Write final deduped jobs to `output/jobs.json`.

Why this keeps it clean:
- Duplicate job records are removed even when URLs differ.
- The same pipeline run produces predictable output artifacts.

## Output Files

- `output/host_profiles.json` (profile stage result)
- `output/job_urls.jsonl` (discovered detail URLs)
- `output/rejected_urls.jsonl` (stage-level rejections)
- `output/jobs.json` (final deduped jobs)

## Reliability Rules Across All Steps

- Canonicalize URLs at every stage.
- Filter known-noise paths early.
- Prefer host-level gating before URL-level deep crawling.
- Use controlled concurrency for scale without overload.
- Track stage-specific rejections for debugging and cleanup.
