import net from "node:net";

export type SeedProbeFn = (
  host: string,
  port: number,
  timeoutMs: number,
) => Promise<boolean>;

export function defaultPortForProtocol(protocol: string): number {
  return protocol === "http:" ? 80 : 443;
}

export function isHostReachableTcp(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function probeHostReachabilityTcp(options: {
  host: string;
  port: number;
  timeoutMs: number;
  retries: number;
  probeFn?: SeedProbeFn;
}): Promise<boolean> {
  const attempts = Math.max(1, options.retries + 1);
  const probeFn = options.probeFn ?? isHostReachableTcp;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await probeFn(options.host, options.port, options.timeoutMs)) {
        return true;
      }
    } catch {
      // Probe errors count as unreachable attempts.
    }
  }

  return false;
}
