import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ebay Randomiser",
  description: "Spin and remove items from a 500-item pool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
