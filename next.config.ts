import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "unpdf"],
  images: {
    // Fotos oficiais de parlamentares (origem exibida junto à imagem).
    remotePatterns: [
      { protocol: "https", hostname: "www.camara.leg.br", pathname: "/internet/deputado/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
