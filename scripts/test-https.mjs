// Bounded HTTPS smoke test: temporary cert, temporary proxy container and a
// production Next process. No database writes, global trust installs or live
// server restarts. Browser certificate bypass is limited to this test context;
// Node's HTTPS requests verify the temporary certificate explicitly.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(join(tmpdir(), "anchor-https-smoke-"));
const container = `anchor-https-test-${process.pid}-${Date.now()}`;
const image = readFileSync(`${root}docker-compose.https.yml`, "utf8").match(/image: (caddy:[^\s]+)/)[1];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function port() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const number = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return number;
}
let app, proxy, browser;
let logs = "";
try {
  if (!existsSync(`${root}.next/BUILD_ID`)) throw new Error("Run npm run build first.");
  writeFileSync(join(temp, "openssl.cnf"), "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n");
  const cert = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-sha256", "-config", join(temp, "openssl.cnf"), "-keyout", join(temp, "anchor-key.pem"), "-out", join(temp, "anchor.pem")], { encoding: "utf8" });
  assert.equal(cert.status, 0, "OpenSSL must generate the temporary test certificate");
  const upstream = await port(), tls = await port();
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(upstream)], {
    cwd: root, env: { ...process.env, ENABLE_DEMO_LOGIN: "false", SESSION_COOKIE_SECURE: "true", DATABASE_URL: "postgresql://unused@127.0.0.1:1/https_smoke" }, stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (chunk) => { logs += chunk; });
  app.stderr.on("data", (chunk) => { logs += chunk; });
  const mounts = ["--mount", `type=bind,src=${root}deploy/Caddyfile,dst=/etc/caddy/Caddyfile,readonly`, "--mount", `type=bind,src=${temp},dst=/certificates,readonly`];
  const env = ["-e", `ANCHOR_HTTPS_UPSTREAM=host.docker.internal:${upstream}`];
  const gateway = process.platform === "linux" ? ["--add-host", "host.docker.internal:host-gateway"] : [];
  const validate = spawnSync("docker", ["run", "--rm", ...mounts, ...env, image, "caddy", "validate", "--config", "/etc/caddy/Caddyfile"], { encoding: "utf8", timeout: 120000 });
  assert.equal(validate.status, 0, validate.stderr);
  proxy = spawn("docker", ["run", "--rm", "--name", container, "-p", `127.0.0.1:${tls}:443`, ...gateway, ...mounts, ...env, image], { stdio: ["ignore", "pipe", "pipe"] });
  proxy.stdout.on("data", (chunk) => { logs += chunk; });
  proxy.stderr.on("data", (chunk) => { logs += chunk; });
  const base = `https://127.0.0.1:${tls}`;
  const ca = readFileSync(join(temp, "anchor.pem"));
  const call = (path, method = "GET", origin = base) => new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method, ca, headers: { Origin: origin }, timeout: 5000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("timeout", () => req.destroy(new Error("HTTPS request timed out")));
    req.on("error", reject); req.end();
  });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (app.exitCode !== null || proxy.exitCode !== null) throw new Error("Test server/proxy exited before readiness");
    try { ready = (await call("/api/session")).status === 200; } catch { /* starting */ }
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, "HTTPS proxy did not become ready");
  const redirect = await call("/messages");
  assert.equal(redirect.status, 307);
  assert.equal(new URL(redirect.headers.location, base).href, `${base}/login`, "Relative or absolute redirects must retain the external HTTPS host/port");
  const logout = await call("/api/session", "DELETE");
  assert.equal(logout.status, 200, "Same-origin mutation must work through the HTTPS proxy");
  const cookie = logout.headers["set-cookie"].find((value) => value.startsWith("anchor_session="));
  assert.match(cookie, /; Secure/i); assert.match(cookie, /; HttpOnly/i); assert.match(cookie, /SameSite=strict/i);
  assert.equal((await call("/api/session", "DELETE", "https://untrusted.invalid")).status, 403);
  browser = await chromium.launch({ channel: process.env.E2E_BROWSER_CHANNEL || undefined, headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  const crypto = await page.evaluate(() => ({ secure: window.isSecureContext, protocol: location.protocol, uuid: globalThis.crypto.randomUUID() }));
  assert.equal(crypto.secure, true); assert.equal(crypto.protocol, "https:");
  assert.match(crypto.uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);
  console.log("HTTPS smoke passed: verified TLS, proxy config, external HTTPS redirects, Secure/HttpOnly cookies, same-origin enforcement and browser crypto.randomUUID.");
} catch (error) {
  console.error(error.message);
  console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  await browser?.close();
  spawnSync("docker", ["stop", "--time", "5", container], { stdio: "ignore", timeout: 20000 });
  if (app && app.exitCode === null) {
    const exited = new Promise((resolve) => app.once("exit", resolve));
    app.kill("SIGTERM"); await exited;
  }
  if (proxy && proxy.exitCode === null) await new Promise((resolve) => proxy.once("exit", resolve));
  rmSync(temp, { recursive: true, force: true });
}
