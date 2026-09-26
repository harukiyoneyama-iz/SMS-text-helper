import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 実データを扱う社内ツールのため、ビルド成果物にソースマップを含めない
  productionBrowserSourceMaps: false,
};

export default nextConfig;
