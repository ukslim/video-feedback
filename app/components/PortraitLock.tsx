"use client";

import { useEffect, useState } from "react";

const MOBILE_MAX_WIDTH = 768;

function isLandscape(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth > window.innerHeight;
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= MOBILE_MAX_WIDTH;
}

export default function PortraitLock({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showRotateOverlay, setShowRotateOverlay] = useState(false);

  useEffect(() => {
    const screen = window.screen as Screen & { orientation?: { lock: (o: string) => Promise<void> } };
    const tryLockPortrait = () => {
      if (!isMobile()) return;
      screen.orientation?.lock?.("portrait").catch(() => {
        // Lock not supported or denied (e.g. iOS, or user policy)
      });
    };

    const updateOverlay = () => {
      setShowRotateOverlay(isMobile() && isLandscape());
    };

    tryLockPortrait();
    updateOverlay();

    window.addEventListener("orientationchange", updateOverlay);
    window.addEventListener("resize", updateOverlay);

    return () => {
      window.removeEventListener("orientationchange", updateOverlay);
      window.removeEventListener("resize", updateOverlay);
    };
  }, []);

  return (
    <>
      {children}
      {showRotateOverlay && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--background)] text-[var(--foreground)]"
          aria-live="polite"
        >
          <p className="text-center text-lg font-medium">
            Please rotate your device to portrait
          </p>
        </div>
      )}
    </>
  );
}
