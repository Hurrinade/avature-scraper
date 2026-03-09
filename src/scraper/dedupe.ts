import type { JobOutput } from "../types/index.ts";
import { hashText, normalizeForKey } from "../utils/text.ts";

function firstMetadataValue(value: string | string[] | null | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = item.trim();
      if (trimmed) return trimmed;
    }
  }

  return undefined;
}

function extractJobId(record: JobOutput): string | undefined {
  return (
    firstMetadataValue(record.metadata.jobId) ??
    firstMetadataValue(record.metadata["job id"]) ??
    firstMetadataValue(record.metadata.requisitionId) ??
    firstMetadataValue(record.metadata["requisition id"])
  );
}

export function buildDedupeKey(record: JobOutput): string {
  const jobId = extractJobId(record);
  if (jobId) {
    return `jobid:${normalizeForKey(record.host)}:${normalizeForKey(jobId)}`;
  }

  if (record.jobDetailUrl) {
    return `url:${record.jobDetailUrl.toLowerCase()}`;
  }

  const location = firstMetadataValue(record.metadata.location) ?? "";
  const fallback = `${normalizeForKey(record.host)}|${normalizeForKey(record.jobTitle)}|${normalizeForKey(location)}`;
  return `fallback:${hashText(fallback)}`;
}

export function dedupeJobs(records: JobOutput[]): { deduped: JobOutput[]; duplicates: JobOutput[] } {
  const seen = new Set<string>();
  const deduped: JobOutput[] = [];
  const duplicates: JobOutput[] = [];

  for (const record of records) {
    const key = buildDedupeKey(record);
    if (seen.has(key)) {
      duplicates.push(record);
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return { deduped, duplicates };
}
