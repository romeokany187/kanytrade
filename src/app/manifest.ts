import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kanytrade",
    short_name: "Kanytrade",
    description: "Terminal de marché et assistant de gestion du risque.",
    start_url: "/",
    display: "standalone",
    background_color: "#101713",
    theme_color: "#101713",
    icons: [
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}