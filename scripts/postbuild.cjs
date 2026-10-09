// Runs after `npm run build`: makes .next/standalone a complete, self-contained app, because hosts with a Next.js preset
// (Hostinger…) start `.next/standalone/server.js` directly.
//  1. Static assets: Next leaves .next/static and public/ out of the standalone folder; without them pages have no CSS/JS.
//  2. .env: the standalone server reads .env from its own folder, not the project root.
//  3. Listen address: the generated server binds to process.env.HOSTNAME, which Linux hosts set to the machine name, so
//     the host's proxy (connecting to 127.0.0.1) gets no answer → "503 Service Unavailable". Bind to all interfaces
//     unless LISTEN_HOST is set explicitly.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const out = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(out, "server.js"))) {
  console.log("postbuild: no standalone output, nothing to do");
  process.exit(0);
}

const copy = (from, to) => {
  if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, force: true });
};
copy(path.join(root, ".next", "static"), path.join(out, ".next", "static"));
copy(path.join(root, "public"), path.join(out, "public"));
copy(path.join(root, ".env"), path.join(out, ".env"));

const serverFile = path.join(out, "server.js");
const src = fs.readFileSync(serverFile, "utf8");
const patched = src.replace(/const hostname = process\.env\.HOSTNAME \|\| '0\.0\.0\.0'/, "const hostname = process.env.LISTEN_HOST || '0.0.0.0'");
if (patched === src && !src.includes("LISTEN_HOST")) console.warn("postbuild: listen address line not found (Next.js changed?)");
fs.writeFileSync(serverFile, patched);
console.log("postbuild: standalone app ready (static files, public, .env, listen 0.0.0.0)");
