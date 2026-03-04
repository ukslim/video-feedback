import type { NextConfig } from "next";

// When building for GitHub Pages (e.g. in CI), site is served at /<repo-name>/
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath = repoName ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath && { basePath, assetPrefix: basePath }),
};

export default nextConfig;
