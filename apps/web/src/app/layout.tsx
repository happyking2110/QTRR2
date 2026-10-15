import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "MBF Risk Monitor",
  description: "Hệ thống Quản lý Hồ sơ Rủi ro Trọng yếu MobiFone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  headers().get('x-nonce');
  return (
    <html lang="vi">
      <body className="antialiased font-sans bg-bg-page text-text min-h-screen">
        {children}
      </body>
    </html>
  );
}
