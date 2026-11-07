import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Courage for Kids Team Portal",
    short_name: "CFK Portal",
    description: "Courage for Kids team assignments, deadlines and updates.",
    start_url: "/launch",
    display: "standalone",
    background_color: "#004F81",
    theme_color: "#004F81",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
