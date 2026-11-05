import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function httpsDevConfig(root, env, args = []) {
  const cert = resolve(root, env.ANCHOR_HTTPS_CERT || "certificates/anchor.pem");
  const key = resolve(root, env.ANCHOR_HTTPS_KEY || "certificates/anchor-key.pem");
  if (!existsSync(cert) || !existsSync(key)) {
    throw new Error("HTTPS certificate/key missing. Install mkcert, run mkcert -install, then npm run https:certs -- <hostname-or-IP>. See README: HTTPS for teammates.");
  }
  // A failed/missing certificate must never fall back to untrusted automatic
  // generation or to HTTP. Do not permit forwarded flags to replace this TLS setup.
  if (args.some((arg) => arg.startsWith("--experimental-https"))) throw new Error("Configure certificate paths with ANCHOR_HTTPS_CERT/KEY, not extra TLS flags.");
  return {
    args: ["dev", "--experimental-https", "--experimental-https-cert", cert, "--experimental-https-key", key,
      "--hostname", env.ANCHOR_HTTPS_BIND || "127.0.0.1", ...args],
    env: { ...env, SESSION_COOKIE_SECURE: "true", PORT: env.ANCHOR_HTTPS_PORT || env.PORT || "3443" },
  };
}
