import type { NextConfig } from "next";

const deviceApp = process.env.NEXT_PUBLIC_DEVICE_APP === "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  ...(deviceApp
    ? {
        output: "export" as const,
        images: { unoptimized: true },
        env: {
          NEXT_PUBLIC_TWELVE_DATA_API_KEY: process.env.TWELVE_DATA_API_KEY ?? "",
        },
      }
    : {}),
};

export default nextConfig;
