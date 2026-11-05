import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { httpsDevConfig } from "./https-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
test("HTTPS development requires explicit certs, forces Secure cookies and defaults to loopback", () => {
  const dir = mkdtempSync(join(tmpdir(), "anchor-https-config-"));
  try {
    assert.throws(() => httpsDevConfig(dir, {}), /certificate\/key missing/);
    mkdirSync(join(dir, "certificates"));
    writeFileSync(join(dir, "certificates/anchor.pem"), "test fixture only");
    writeFileSync(join(dir, "certificates/anchor-key.pem"), "test fixture only");
    const env = { SESSION_COOKIE_SECURE: "false" };
    const config = httpsDevConfig(dir, env, ["--port", "3443"]);
    assert.equal(config.env.SESSION_COOKIE_SECURE, "true");
    assert.equal(config.env.PORT, "3443");
    assert.equal(env.SESSION_COOKIE_SECURE, "false");
    assert.ok(config.args.includes("--experimental-https"));
    assert.equal(config.args[config.args.indexOf("--hostname") + 1], "127.0.0.1");
    assert.deepEqual(config.args.slice(-2), ["--port", "3443"]);
    assert.throws(() => httpsDevConfig(dir, env, ["--experimental-https-key=other.pem"]), /TLS flags/);
    const custom = httpsDevConfig(dir, { ANCHOR_HTTPS_CERT: "certificates/anchor.pem", ANCHOR_HTTPS_KEY: "certificates/anchor-key.pem", ANCHOR_HTTPS_BIND: "192.0.2.10", ANCHOR_HTTPS_PORT: "4443" });
    assert.equal(custom.args[custom.args.indexOf("--hostname") + 1], "192.0.2.10");
    assert.equal(custom.env.PORT, "4443");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("certificate helper rejects URLs before generating anything or changing trust", () => {
  const result = spawnSync(process.execPath, ["scripts/create-https-certs.mjs", "https://host.example:3443"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /only hostnames\/IPs/);
});

test("private TLS material is excluded from both source control and Docker build context", () => {
  assert.match(readFileSync(`${root}.gitignore`, "utf8"), /\/certificates\//);
  const ignore = readFileSync(`${root}.dockerignore`, "utf8");
  assert.match(ignore, /^certificates$/m);
  assert.match(ignore, /\*\*\/\*\.pem/);
});

test("merged HTTPS Compose config closes HTTP and enables Secure cookies with a pinned TLS proxy", () => {
  const result = spawnSync("docker", ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.https.yml", "config", "--format", "json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, "Docker Compose 2.24.4+ must parse the HTTPS override");
  const config = JSON.parse(result.stdout);
  assert.ok(!config.services.anchor.ports?.length);
  assert.equal(config.services.anchor.environment.SESSION_COOKIE_SECURE, "true");
  assert.equal(config.services.https.ports.length, 1);
  assert.equal(config.services.https.ports[0].target, 443);
  assert.match(config.services.https.image, /caddy:2\.11\.2-alpine@sha256:[a-f0-9]{64}$/);
  assert.ok(config.services.https.volumes.every((volume) => volume.read_only && volume.bind.create_host_path === false));
  assert.ok(!config.services.https.volumes.some((volume) => /rootCA/.test(volume.source)));
});
