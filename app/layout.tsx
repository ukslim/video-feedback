import type { Metadata, Viewport } from "next";
import PortraitLock from "@/app/components/PortraitLock";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
      <body className="antialiased">
        <PortraitLock>{children}</PortraitLock>
      </body>
    </html>
  );
}
