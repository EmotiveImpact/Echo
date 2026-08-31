import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-edge-tts", "ws"],
};

export default nextConfig;
