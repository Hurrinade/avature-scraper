import pLimit from "p-limit";

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = pLimit(Math.max(1, Math.min(concurrency, items.length)));
  const tasks = items.map((item, index) => limit(() => mapper(item, index)));
  return Promise.all(tasks);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
