import type { Metadata } from "next";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Augusu Blog",
  description: "アウグスのブログ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <div className="max-w-4xl mx-auto bg-white min-h-screen shadow-sm">
          <Navigation />
          <main className="px-4 py-6">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
