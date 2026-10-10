import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Twisty Lab — Rubik's Cube & Clover Pyramid",
  description:
    "Interactive vanilla Three.js twisty puzzles: an AI-playable Rubik's Cube and the Clover Pyramid jumbling tetrahedron. Static export, WebGL, mouse and touch.",
  keywords: [
    "Twisty Lab",
    "3D puzzles",
    "Three.js",
    "Rubik's Cube",
    "Clover Pyramid",
    "jumbling puzzle",
    "Photo Jigsaw",
    "jigsaw puzzle",
  ],
  authors: [{ name: "Twisty Lab" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Twisty Lab",
    description:
      "Interactive Three.js twisty puzzles: Rubik's Cube and the Clover Pyramid",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Twisty Lab",
    description:
      "Interactive Three.js twisty puzzles: Rubik's Cube and the Clover Pyramid",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
