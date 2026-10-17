import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "HydroTrust AI",
  description: "Decentralized hydrological intelligence for flood exposure, blue carbon, and verifiable stream telemetry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
