import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import pkg from "./package.json";

// Short commit hash for the footer version tag, resolved once at build time.
// GIT_COMMIT wins when set (CI or `docker build --build-arg`). Otherwise read
// .git directly instead of shelling out to git, because the Docker build image
// (node:22-alpine) has no git binary. .dockerignore lets HEAD and refs through.
function gitCommit(): string {
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    const gitDir = path.join(process.cwd(), ".git");
    const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7); // detached HEAD
    const ref = head.slice(5);
    const loose = path.join(gitDir, ref);
    if (existsSync(loose)) return readFileSync(loose, "utf8").trim().slice(0, 7);
    const packed = readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
    if (line) return line.slice(0, 7);
  } catch {
    // No .git (e.g. a source tarball): fall through.
  }
  return "unknown";
}

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Server Simulators, Network Topology and Offline Mode became one screen.
  async redirects() {
    return [
      ...["/simulators", "/topology", "/offline"].map((source) => ({ source, destination: "/network", permanent: true })),
      { source: "/personalized-preview", destination: "/", permanent: false },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Inlined into the client bundle at build time, so the standalone Docker
  // server needs no git or package.json at runtime.
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit(),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
