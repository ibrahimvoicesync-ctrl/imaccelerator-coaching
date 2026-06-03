import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IMA Accelerator",
  description: "Student performance & coaching management platform for Abu Lahya's halal influencer marketing mentorship program.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-ima-bg text-ima-text antialiased`}>
        {children}
      </body>
    </html>
  );
}
