import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Geolocation is needed by the table menu (ordering only from inside the restaurant); nothing else.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // One self-contained Node server (plus Postgres): `node .next/standalone/server.js`.
  output: "standalone",
  poweredByHeader: false,
  // PGlite (development / tests) ships WASM files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "sharp", "pg"],
  // Never ship local databases / uploads inside the build output.
  outputFileTracingExcludes: { "*": ["./data/**", "./data-dev/**", "./data-e2e/**", "./tests/**", "./docs/**"] },
  // Files read at run time: SQL migrations (applied at start) and the fonts of the printable QR cards.
  // sharp loads libvips (with the text renderer used for QR cards) dynamically: the tracer misses it and sharp would fall
  // back to its WebAssembly build, which cannot draw text. Ship the native packages for the build platform explicitly.
  // The webpack build (used on Hostinger) also misses next/dist/lib/metadata, which the standalone server requires at start.
  outputFileTracingIncludes: { "*": ["./drizzle/**", "./assets/fonts/**", "./node_modules/@img/sharp-*/**", "./node_modules/next/dist/lib/metadata/**"] },
  images: { unoptimized: true }, // menu images are already optimized (WebP, sized) when stored
  // Dashboard uploads (logo, cover, banners) go through Server Actions: allow up to 8 MB images.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
