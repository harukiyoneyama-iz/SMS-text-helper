import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMS文例検索ツール",
  description: "過去に送られたSMS文例を検索して文章案・依頼まで出せる社内ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
