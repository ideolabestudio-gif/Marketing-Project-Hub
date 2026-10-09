import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // La pantalla de permiso del conector de Claude no se puede incrustar en otra web.
        source: "/oauth/authorize",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Subida de archivos de hasta 25 MB (MAX_UPLOAD_BYTES) + margen del multipart.
      bodySizeLimit: "26mb",
    },
  },
};

export default nextConfig;
