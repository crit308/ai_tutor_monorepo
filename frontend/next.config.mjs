import path from "node:path";
import { fileURLToPath } from "node:url";

// Recreate __dirname in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
    turbo: {
      // Set root to parent directory to access convex folder
      root: path.resolve(__dirname, '..'),
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*', // Proxy to FastAPI backend
      },
    ];
  },
};

export default nextConfig; 