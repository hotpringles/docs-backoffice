import type { NextConfig } from "next";
import { serviceWorkerHeaders } from "./src/lib/pwa/headers";

const nextConfig: NextConfig = {
  async headers() {
    return serviceWorkerHeaders();
  },
};

export default nextConfig;
