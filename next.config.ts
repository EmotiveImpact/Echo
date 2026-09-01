import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-edge-tts", "ws"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
