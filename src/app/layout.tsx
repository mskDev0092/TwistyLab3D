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
  title: "3D Puzzle Arcade — Rubik's Cube & Jumbling Pyramids",
  description:
    "Interactive vanilla Three.js puzzles: an AI-playable Rubik's Cube and the Clover Pyramid jumbling puzzle. Static export, WebGL, mouse and touch.",
  keywords: ["3D puzzles", "Three.js", "Rubik's Cube", "jumbling puzzle"],
  authors: [{ name: "3D Puzzle Arcade" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "3D Puzzle Arcade",
    description: "Interactive Three.js puzzles: Rubik's Cube and Jumbling Pyramids",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "3D Puzzle Arcade",
    description: "Interactive Three.js puzzles: Rubik's Cube and Jumbling Pyramids",
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
