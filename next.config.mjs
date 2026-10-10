/**
 * Static-export configuration.
 *
 * `output: 'export'` makes `next build` emit a fully static site into `out/`
 * (plain HTML/JS/CSS - deployable to GitHub Pages, S3, Netlify, nginx, ...).
 *
 * GitHub Pages project sites are served from `https://<user>.github.io/<repo>/`,
 * so when `NEXT_PUBLIC_BASE_PATH` is set (the deploy workflow sets it to
 * `/<repo>`, or empty for a `<user>.github.io` user site) we apply it as both
 * `basePath` and `assetPrefix`. Locally the variable is unset, so the site
 * builds at the root.
 *
 * Consequences handled here / elsewhere in the repo:
 * - Route Handlers, ISR and server-only features are not allowed;
 *   `src/app/api/` has been removed from this project on purpose.
 * - The Next Image Optimization server does not exist in a static export, so
 *   `images.unoptimized` is mandatory.
 * - All Three.js code is gated behind `next/dynamic` with `{ ssr: false }`
 *   (see components/*Wrapper.tsx) so nothing browser-specific is ever
 *   evaluated during prerendering.
 * - A `public/.nojekyll` file is emitted so GitHub Pages does not strip the
 *   `_next/` asset directory.
 *
 * @type {import('next').NextConfig}
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: false,
  trailingSlash: true, // friendlier for static hosts serving out/ directories
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
