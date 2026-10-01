import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Subida de archivos de hasta 25 MB (MAX_UPLOAD_BYTES) + margen del multipart.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
