import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baseball Analytics",
  description: "Baseball team and player data analysis app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
