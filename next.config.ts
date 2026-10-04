import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["firebase-admin", "jwks-rsa"],
};

export default nextConfig;
