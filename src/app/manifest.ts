import type { MetadataRoute } from "next";
import { APP_THEME_COLOR } from "@/lib/theme";

// Lets members add Our Place to their home screen and open it without browser
// bars, which is also the only true full screen an iPhone gives a web page.
// The mushroom art is drawn for Our Place (see CREDITS.md). It stays inside the
// maskable safe zone, so the same files serve both purposes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Our Place",
    short_name: "Our Place",
    description: "An invite-only community for people who know each other in real life.",
    start_url: "/",
    display: "standalone",
    background_color: APP_THEME_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
