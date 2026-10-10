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

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL("https://twisty-lab.example"),
  title: "Twisty Lab — Rubik's Cube, Clover Pyramid & Photo Jigsaw",
  description:
    "An interactive vanilla Three.js puzzle room: an AI-playable Rubik's Cube, the Clover Pyramid jumbling tetrahedron, and a Photo Jigsaw you build on the table. Static export, WebGL, mouse and touch.",
  keywords: [
    "Twisty Lab",
    "3D puzzles",
    "Three.js",
    "Rubik's Cube",
    "Clover Pyramid",
    "jumbling puzzle",
    "Photo Jigsaw",
    "jigsaw puzzle",
    "jigsaw puzzle types",
  ],
  authors: [{ name: "Twisty Lab" }],
  icons: {
    icon: `${basePath}/logo.svg`,
  },
  openGraph: {
    title: "Twisty Lab",
    description:
      "Interactive Three.js puzzles: Rubik's Cube, Clover Pyramid and Photo Jigsaw",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Twisty Lab",
    description:
      "Interactive Three.js puzzles: Rubik's Cube, Clover Pyramid and Photo Jigsaw",
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
