import { describe, expect, test } from "bun:test";
import { parseArgs, parseProfileArgs } from "../cli/args.ts";

describe("cli args", () => {
  test("parses help flags", () => {
    expect(parseArgs(["bun", "index.ts", "--help"]).help).toBeTrue();
    expect(parseArgs(["bun", "index.ts", "-h"]).help).toBeTrue();
  });

  test("parses limit flags", () => {
    const parsed = parseArgs(["bun", "index.ts", "--limit-hosts=10", "--limit-jobs=20"]);
    expect(parsed.limitHosts).toBe(10);
    expect(parsed.limitJobs).toBe(20);
  });

  test("parses profile source mode and host profiles file", () => {
    const parsed = parseArgs([
      "bun",
      "index.ts",
      "--profile-source-mode=generate",
      "--host-profiles-file=custom/profiles.json",
    ]);
    expect(parsed.profileSourceMode).toBe("generate");
    expect(parsed.hostProfilesFile).toBe("custom/profiles.json");
  });

  test("ignores invalid numeric limits", () => {
    const parsed = parseArgs(["bun", "index.ts", "--limit-hosts=0", "--limit-jobs=abc"]);
    expect(parsed.limitHosts).toBeUndefined();
    expect(parsed.limitJobs).toBeUndefined();
  });

  test("ignores invalid profile source mode", () => {
    const parsed = parseArgs(["bun", "index.ts", "--profile-source-mode=foo"]);
    expect(parsed.profileSourceMode).toBeUndefined();
  });
});

describe("profile cli args", () => {
  test("parses profile command flags", () => {
    const parsed = parseProfileArgs([
      "bun",
      "profile.ts",
      "--limit-hosts=3",
      "--host-profiles-file=output/custom-hosts.json",
    ]);
    expect(parsed.limitHosts).toBe(3);
    expect(parsed.hostProfilesFile).toBe("output/custom-hosts.json");
  });
});
