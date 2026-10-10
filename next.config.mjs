/**
 * Static-export configuration.
 *
 * `output: 'export'` makes `next build` emit a fully static site into `out/`
 * (plain HTML/JS/CSS - deployable to GitHub Pages, S3, Netlify, nginx, ...).
 *
 * Consequences handled here / elsewhere in the repo:
 * - Route Handlers, ISR and server-only features are not allowed;
 *   `src/app/api/` has been removed from this project on purpose.
 * - The Next Image Optimization server does not exist in a static export, so
 *   `images.unoptimized` is mandatory.
 * - All Three.js code is gated behind `next/dynamic` with `{ ssr: false }`
 *   (see components/RubiksCubeWrapper.tsx) so nothing browser-specific is
 *   ever evaluated during prerendering.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: false,
  trailingSlash: true, // friendlier for static hosts serving out/ directories
};

export default nextConfig;
