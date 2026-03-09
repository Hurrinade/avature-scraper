import { appendFile } from "node:fs/promises";
import { ensureDirForFile } from "./fs.ts";

export async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await ensureDirForFile(filePath);
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export async function resetJsonl(filePath: string): Promise<void> {
  await ensureDirForFile(filePath);
  await Bun.write(filePath, "");
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return [];
  }

  const content = await file.text();
  if (!content.trim()) {
    return [];
  }

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
