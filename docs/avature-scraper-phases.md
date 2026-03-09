# Avature Scraper Phase Plan (Master Reference)

Last updated: 2026-03-09

## Project Defaults

- Runtime: Bun-first
- Primary input: `Urls.txt`
- v1 extraction scope: API + HTML only (no browser fallback)
- Coverage goal: maximize unique deduped jobs

## Phase Status

| Phase | Name                                | Status      | Output(s)                                  |
| ----- | ----------------------------------- | ----------- | ------------------------------------------ |
| 0     | Foundation + Plan Doc               | Done        | `src/*`, `docs/avature-scraper-phases.md`  |
| 1     | URL Intake + Seed Normalization     | Done        | `output/hosts_index.json`                  |
| 2     | Host Profiling                      | Done        | `output/site_profiles.jsonl`               |
| 3     | Inventory Extraction                | Done        | `output/inventory_jobs.jsonl`              |
| 4     | Job Detail Extraction               | Done        | `output/jobs_raw.jsonl`                    |
| 5     | Normalize + Dedupe                  | Done        | `output/jobs_deduped.json`                 |
| 6     | Observability + Hardening           | Done        | `output/site_stats.json`, `logs/errors.jsonl` |
| 7     | Finalization + Submission Readiness | In Progress | `README.md`, final run artifacts           |

## Phase Details

### Phase 0: Foundation + Plan Doc

Objective: build the base runtime/config/logging/fetch primitives and a CLI entrypoint.

Deliverables:

- Typed data contracts in `src/types`
- Config loader and validation
- Structured logger and retryable fetch helper
- CLI mode parser and pipeline orchestrator
- This master phase document

Acceptance criteria:

- `bun run index.ts --help` prints usage
- Core phase functions are callable by mode

Risks:

- Drift between planned outputs and generated files

### Phase 1: URL Intake + Seed Normalization

Objective: stream and normalize large URL input, grouped by host.

Deliverables:

- Stream parser for `Urls.txt`
- `output/hosts_index.json`
- Invalid URL capture into `logs/errors.jsonl`

Acceptance criteria:

- Deterministic canonical URL normalization
- Host index generated with candidate entry URLs

Risks:

- Very large inputs can cause long runtimes

### Phase 2: Host Profiling

Objective: choose one canonical listing/search endpoint per host.

Deliverables:

- Candidate probing (seed URLs + fallback paths)
- Strategy classification: `api_first`, `html_listing`, `unknown`, `blocked`
- `output/site_profiles.jsonl`

Acceptance criteria:

- One profile entry per processed host
- Reachability and strategy captured

Risks:

- Sites with anti-bot policies may be marked blocked/unreachable

### Phase 3: Inventory Extraction

Objective: collect unique job detail URLs per profile.

Deliverables:

- Pagination traversal (`jobOffset`, `jobRecordsPerPage`)
- Global + per-host dedupe of detail URLs
- `output/inventory_jobs.jsonl`

Acceptance criteria:

- Crawl stops on empty/no-new pages
- Inventory records include host/source listing metadata

Risks:

- Non-standard pagination can reduce coverage

### Phase 4: Job Detail Extraction

Objective: extract job-level fields from detail pages.

Deliverables:

- Detail fetch with retries and per-host throttling
- Fallback parsing for title/description/location/date/jobId
- Store raw description HTML and cleaned text
- `output/jobs_raw.jsonl`

Acceptance criteria:

- Detail extraction resilient to partial parse failures
- Failures are logged without aborting full run

Risks:

- Highly custom page templates may lower parse confidence

### Phase 5: Normalize + Dedupe

Objective: normalize records and produce final deduped dataset.

Deliverables:

- Normalized `JobRecord`
- Dedupe priority: `jobId` -> canonical URL -> fallback hash
- `output/jobs_deduped.json`

Acceptance criteria:

- Reproducible dedupe counts
- Stable output shape

Risks:

- Cross-host duplicate detection may still miss semantic duplicates

### Phase 6: Observability + Hardening

Objective: make runs inspectable and reliable.

Deliverables:

- `logs/errors.jsonl` structured error events
- `output/site_stats.json` run + per-host metrics

Acceptance criteria:

- Host/job failures do not terminate pipeline
- Metrics make coverage gaps obvious

Risks:

- Very large runs can produce large logs and stats artifacts

### Phase 7: Finalization + Submission Readiness

Objective: package implementation and runbook for handoff.

Deliverables:

- Updated README with architecture, modes, outputs, and tradeoffs
- One-command full run path (`bun run index.ts all`)

Acceptance criteria:

- Team can run and inspect outputs without code changes

Risks:

- Final runtime duration depends on target host health and network stability
