# Avature ATS Scraper — Project Kickoff Plan

## Goal

Build a Node.js scraper that finds as many Avature-hosted career sites as possible and extracts as many valid job postings as possible.

Primary evaluation metric: **total unique jobs scraped**.

---

## Core strategy

Do **not** start by building a perfect scraper for one site.

Start by building a **generic Avature pipeline** that works across many hosts, then add targeted fixes only where needed.

The project should have 4 stages:

1. **Discovery** — find Avature-hosted career sites
2. **Inventory extraction** — get job listing pages / job URLs from each site
3. **Job detail extraction** — extract full job data from each job page
4. **Normalization + output** — store clean deduped results locally

---

## Recommended tech stack

Use **Node.js** with simple, scalable tools.

### Main stack

- **Node.js**
- **TypeScript** if you want cleaner code and safer refactors
  - plain JS is okay if you want speed
- **undici** or native `fetch` for HTTP requests
- **cheerio** for HTML parsing
- **p-limit** or **Bottleneck** for concurrency control
- **fast-csv** or simple JSONL writing for output
- **zod** optional, for schema validation
- **dotenv** optional, for config

### Why this stack

- fast to build
- no browser dependency
- scalable
- easier to debug than browser automation
- matches the assignment requirement better than Playwright/Puppeteer-first approaches

### What to avoid unless absolutely necessary

- Playwright / Puppeteer as the main strategy
- Browser automation frameworks
- LLM-powered runtime logic
- Heavy databases unless you already move fast with them

For this assignment, flat files are enough.

---

## Output format

Use **JSONL during scraping** and optionally export a final JSON/CSV.

Why JSONL:
- append-friendly
- easy to inspect
- good for partial runs
- easy to dedupe later

Suggested final files:

```text
input/avature_sites.csv
output/jobs.jsonl
output/jobs_deduped.json
output/site_stats.json
logs/errors.jsonl
```

---

## Suggested project structure

```text
avature-scraper/
  src/
    index.ts
    config.ts
    types.ts

    discovery/
      seedLoader.ts
      avatureHostDiscovery.ts
      validateHost.ts

    profiler/
      profileSite.ts
      findSearchUrl.ts
      detectPagination.ts
      detectJobLinks.ts

    scrapers/
      genericAvatureScraper.ts
      strategies/
        generic.ts
        fallback.ts

    extractors/
      searchResults.ts
      jobDetail.ts
      metadata.ts

    normalize/
      cleanHtml.ts
      normalizeJob.ts
      dedupe.ts

    output/
      writeJsonl.ts
      writeCsv.ts

    utils/
      fetchWithRetry.ts
      url.ts
      logger.ts
      hashes.ts

  input/
  output/
  logs/
  package.json
  tsconfig.json
  README.md
```

If you want pure JS, same structure, just `.js` files.

---

## Data model

Use one normalized job schema from day one.

```ts
type JobRecord = {
  sourceHost: string;
  sourceSearchUrl: string;
  jobId?: string;
  title: string;
  applicationUrl: string;
  detailUrl: string;
  descriptionHtml?: string;
  descriptionText?: string;
  location?: string;
  datePosted?: string;
  metadata: Record<string, string | string[] | null>;
  scrapedAt: string;
};
```

Important: keep both:
- `descriptionHtml`
- `descriptionText`

HTML is useful when cleaning fails.

---

## How to tackle the project

## Phase 1 — Build the discovery layer

Start with:
- provided starter pack
- known examples
- any Avature URLs you already have

Then expand the list.

### Discovery targets

You want to collect:
- Avature host
- likely careers/search URL
- whether the site is valid
- maybe company name if obvious

### What to detect

Look for hosts like:
- `company.avature.net`
- career pages containing:
  - `/careers`
  - `/SearchJobs`
  - locale variants like `/en_US/careers/SearchJobs`

### Discovery output

Store a CSV like:

```csv
source_url,host,validated_search_url,status,notes
```

### Discovery rule

You are not trying to fully scrape yet.

You are trying to build the biggest valid list of Avature career hosts.

---

## Phase 2 — Build a site profiler

For each discovered host, test common paths.

Try these first:

```text
/careers/SearchJobs
/en_US/careers/SearchJobs
/SearchJobs
/careers
/en_US/careers
```

The profiler should answer:

- is this a valid public careers site?
- what is the best search URL?
- is pagination visible?
- are job links present in HTML?
- are there hints of API/XHR endpoints?
- does the page need JS to load content?

### Goal

Do not hardcode everything per company.

Create a generic way to classify a site before scraping it.

---

## Phase 3 — Inventory extraction

This is where you gather all job detail URLs.

### Preferred extraction order

1. **JSON/API endpoint**
2. **server-rendered HTML search results**
3. **JS-rendered fallback only if absolutely needed**

That means:

- if the site exposes structured job data, use it
- otherwise parse the HTML listings page
- only use browser-style fallback if there is no clean alternative

### What to extract from search pages

- job title
- job detail URL
- location if available
- posted date if available
- total count if visible
- next page / pagination params

### Pagination

Expect patterns like:
- `jobOffset`
- `jobRecordsPerPage`

Your scraper should loop until:
- no new jobs appear
- no next page exists
- page is empty

### Important rule

Deduplicate job URLs while paginating.

Some sites will repeat jobs across filtered or locale pages.

---

## Phase 4 — Job detail extraction

For each job URL, fetch the detail page and extract:

- title
- full description
- application URL
- location
- date posted
- department / category
- employment type
- job ID
- any other available metadata

### Extraction rule

Use robust selectors, but also add fallback logic.

For example:
- first try common title selectors
- then fallback to `h1`
- then fallback to metadata-based extraction

### Description cleaning

Store:
- raw HTML block
- cleaned text

The cleaned text should:
- remove repeated whitespace
- preserve paragraphs
- strip nav/footer junk
- keep bullet points readable

---

## Phase 5 — Normalize and dedupe

Normalize all records into the same shape.

### Deduping priority

1. exact `jobId`
2. exact canonical `detailUrl`
3. fallback hash:
   - normalized title
   - normalized location
   - normalized source host

### Why this matters

Avature sites may expose:
- duplicate locale pages
- duplicate paths
- jobs through multiple entry points

---

## Phase 6 — Add metrics and logs

This will make the submission stronger.

Track per site:
- pages fetched
- jobs found
- jobs extracted
- duplicates removed
- parse failures
- empty pages
- HTTP failures

Create:

```json
{
  "host": "example.avature.net",
  "searchUrl": "https://example.avature.net/careers/SearchJobs",
  "jobsFound": 124,
  "jobsSaved": 118,
  "duplicates": 6,
  "errors": 2
}
```

This helps prove your engineering logic.

---

## What to build first

Build in this order:

### Step 1
Create the repo, config, types, logger, fetch helper.

### Step 2
Implement a basic host validator + search URL finder.

### Step 3
Implement a generic paginated search-results scraper.

### Step 4
Implement detail-page extraction.

### Step 5
Write JSONL output.

### Step 6
Add dedupe and stats.

### Step 7
Go back and improve failing/high-value sites.

This order matters because coverage is the main metric.

---

## Engineering decisions to make explicit in the README

State these clearly:

### 1. Coverage-first approach
You chose breadth before perfection.

### 2. Generic-first scraper
You built one reusable Avature pipeline before adding edge-case handling.

### 3. Structured data preference
You prefer JSON/API, then HTML, then JS fallback.

### 4. File-based storage
You used local files because the assignment only requires local output.

### 5. Observable scraper
You added logs and per-site metrics to debug coverage gaps.

---

## Edge cases to expect

Plan for these:

- locale paths like `/en_US/`
- search pages with pre-applied filters
- relative URLs
- jobs missing posted date
- duplicate jobs across pages
- inconsistent metadata labels
- expired/empty job detail pages
- sites where listing HTML exists but description structure differs
- weird whitespace / nested HTML in descriptions

Do not try to solve every edge case before the generic flow works.

---

## Concrete implementation rules

### HTTP
- set a realistic user-agent
- use retry with backoff for transient failures
- respect moderate concurrency
- timeout requests

### Parsing
- use small reusable parsing helpers
- never rely on one selector only
- save raw HTML when parsing fails

### URLs
- always resolve relative URLs against the current page
- canonicalize URLs before dedupe

### Resilience
- one site failing should not crash the full run
- one job failing should not stop the site

---

## Recommended concurrency

Keep it moderate.

Example:
- site discovery: 5–10 concurrent requests
- listing pages: 3–5 per host
- job details: 5–10 total or rate-limited per host

You want coverage, not bans.

---

## Practical definition of success

A strong submission is not “perfect parsing on 3 sites”.

A strong submission is:
- many valid Avature hosts discovered
- many total unique jobs extracted
- clean normalized output
- reasonable error handling
- clear explanation of tradeoffs

---

## Minimal MVP

If time gets tight, make sure you at least have:

- discovered site list
- generic search page scraper
- job detail scraper
- JSONL output
- dedupe
- short README explaining approach and limitations

That is already a valid submission.

---

## Suggested README sections

```md
# Avature ATS Scraper

## Overview
## Approach
## Tech stack
## Discovery strategy
## Extraction strategy
## Data schema
## How to run
## Output files
## Tradeoffs / limitations
## Time spent
```

---

## Recommended first coding task for Codex

Ask Codex to generate:

1. Node.js + TypeScript project scaffold
2. `fetchWithRetry`
3. `profileSite(url)`
4. `findSearchUrl(baseUrl)`
5. `scrapeSearchResults(searchUrl)`
6. `scrapeJobDetail(jobUrl)`
7. JSONL writer
8. CLI entrypoint

---

## One-line project strategy

Build a **generic, coverage-first Avature scraper in Node.js** that discovers many Avature hosts, extracts jobs through the cleanest available path, normalizes records, and stores them in local files with metrics and dedupe.
