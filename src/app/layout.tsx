import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Next Blog",
  description: "学び、作り、考える。日々の記録を紡ぐモダンなブログプラットフォーム。",
  openGraph: {
    title: "Next Blog",
    description: "学び、作り、考える。日々の記録を紡ぐモダンなブログプラットフォーム。",
    url: "https://blog.augusu.dev",
    siteName: "Next Blog",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Next Blog",
    description: "学び、作り、考える。日々の記録を紡ぐモダンなブログプラットフォーム。",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
