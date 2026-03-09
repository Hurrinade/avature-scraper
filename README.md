# Avature Scraper (Single-Run Refactor)

Minimal Bun + TypeScript scraper that follows `my-plan.md`.

## Flow

1. Read `Urls.txt`, normalize/group by host, reject `/login` and `/error` URLs.
2. Profile host reachability using seed URLs + fallback listing paths.
3. Discover job detail URLs from reachable listing/search pages.
4. Fetch detail pages and extract job title, descriptions, application URL, and metadata.
5. Dedupe and write final output.

## Usage

```bash
bun run index.ts
bun run index.ts --limit-hosts=50 --limit-jobs=500
```

## Output Artifacts

- `output/host_profiles.jsonl`
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
