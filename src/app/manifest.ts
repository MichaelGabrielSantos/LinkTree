import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Imparciali",
    short_name: "Imparciali",
    description: "Imparcial no método. Aberto na fonte.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#1b1a17",
    lang: "pt-BR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
