import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const hosts = process.argv.slice(2);
if (hosts.includes("--help")) {
  console.log("Usage: npm run https:certs -- <LAN-hostname> <LAN-IP>\nInstall mkcert and run mkcert -install first. localhost and loopback addresses are always included.\nTrust only the CA's public rootCA.pem on teammates' machines; NEVER share rootCA-key.pem or anchor-key.pem.");
} else {
  try {
    if (hosts.some((host) => !isIP(host) && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host))) throw new Error("Supply only hostnames/IPs, without a scheme, port, URL path, wildcard or command flags.");
    const dir = `${root}certificates`;
    const cert = `${dir}/anchor.pem`, key = `${dir}/anchor-key.pem`;
    if (existsSync(cert) || existsSync(key)) throw new Error("Certificate files already exist; they were not overwritten. Move them aside explicitly before issuing a new certificate.");
    const check = spawnSync("mkcert", ["-version"], { encoding: "utf8" });
    if (check.error || check.status !== 0) throw new Error("Install mkcert, run mkcert -install, then retry. See README: HTTPS for teammates.");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const result = spawnSync("mkcert", ["-cert-file", cert, "-key-file", key, ...new Set(["localhost", "127.0.0.1", "::1", ...hosts])], { stdio: "inherit" });
    if (result.error || result.status !== 0) throw new Error("mkcert failed; check its output. No server was started.");
    if (process.platform !== "win32") chmodSync(key, 0o600);
    console.log("Certificates created. Trust this mkcert CA on each client before connecting; no machine trust settings were changed by this script.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
