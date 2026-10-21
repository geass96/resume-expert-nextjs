import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@qoder-ai/qoder-agent-sdk"],
  outputFileTracingIncludes: { "/*": ["./node_modules/@qoder-ai/qoder-agent-sdk/**/*"] },
};
export default nextConfig;
