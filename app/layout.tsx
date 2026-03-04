import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video feedback",
  description: "90s-style video feedback simulation",
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
