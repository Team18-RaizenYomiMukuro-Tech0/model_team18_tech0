import type { NextConfig } from "next";

// 公開版は検索エンジンに載せない（設計.md N-07・D-16。運営の回答 #65）。
// 1. 全応答に X-Robots-Tag（値は設計のとおり）。robots.txt（public/robots.txt）も全拒否
// 2. 手元の開発（npm run dev）だけ、/api/* を FastAPI に渡す。画面が同じ送信元から API を呼べるので、API の CORS を開けない。
//    公開版（build）には入れない（公開版の API は別のホストで、許す送信元は API 側の GIFTIA_ALLOWED_ORIGIN で決める）
const ROBOTS_TAG = "noindex, nofollow";
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: ROBOTS_TAG }] }];
  },
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
