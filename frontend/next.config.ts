import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Load keys from the workspace root .env (../.env) and automatically expose
// ELEVENLABS_* and VAPI_* to the frontend as NEXT_PUBLIC_* so the user never
// has to paste the same key twice.
try {
  const rootEnvPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(rootEnvPath)) {
    const lines = fs.readFileSync(rootEnvPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key && !process.env[key] && val) {
        process.env[key] = val;
      }
    }
  }
} catch {
  // Ignore if root .env cannot be read
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Django serves some API paths with a trailing slash (audit A-21). Do not let Next strip it, or the two redirect to each other forever.
  skipTrailingSlashRedirect: true,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_VOICE_PROVIDER:
      process.env.VOICE_PROVIDER ?? process.env.NEXT_PUBLIC_VOICE_PROVIDER ?? "auto",
    NEXT_PUBLIC_ELEVENLABS_API_KEY:
      process.env.ELEVENLABS_API_KEY ?? process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY ?? "",
    NEXT_PUBLIC_ELEVENLABS_VOICE_ID:
      process.env.ELEVENLABS_VOICE_ID ??
      process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID ??
      "EXAVITQu4vr4xnSDxMaL",
    NEXT_PUBLIC_ELEVENLABS_AGENT_ID:
      process.env.ELEVENLABS_AGENT_ID ?? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "",
    NEXT_PUBLIC_VAPI_PUBLIC_KEY:
      process.env.VAPI_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "",
    NEXT_PUBLIC_VAPI_ASSISTANT_ID:
      process.env.VAPI_ASSISTANT_ID ?? process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID ?? "",
  },
  async rewrites() {
    const apiOrigin = process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";
    return [
      // Keep a trailing slash when the browser sends one (audit A-21); `:path*` alone would drop it.
      {
        source: "/api/:path*/",
        destination: `${apiOrigin}/api/:path*/`,
      },
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
