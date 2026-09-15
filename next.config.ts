import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/chat-settings": ["./assets/fonts/*.ttf"],
    "/api/chat-settings/preview": ["./assets/fonts/*.ttf"],
    "/api/webhook/facebook": ["./assets/fonts/*.ttf"],
  },
};

export default nextConfig;
