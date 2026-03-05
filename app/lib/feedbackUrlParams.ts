/**
 * Compact URL query parameter encoding for shareable feedback canvas state.
 * Single param "p": base64url(JSON array [panX, panY, pitch, yaw, distance, flameOffsetX, flameOffsetY]).
 */

const PARAM_KEY = "p";

const DEFAULTS = {
  panX: 0.02,
  panY: 0.02,
  pitch: 0,
  yaw: 0,
  distance: 1.08,
  flameOffsetX: 0,
  flameOffsetY: 0,
} as const;

const DECIMALS = 3;

function round(v: number): number {
  return Math.round(v * 10 ** DECIMALS) / 10 ** DECIMALS;
}

function base64UrlEncode(s: string): string {
  const b64 = btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): string {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const padded = pad ? b64 + "=".repeat(4 - pad) : b64;
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return "";
  }
}

export type FeedbackParams = {
  panX: number;
  panY: number;
  pitch: number;
  yaw: number;
  distance: number;
  flameOffsetX: number;
  flameOffsetY: number;
};

export const defaultFeedbackParams: FeedbackParams = { ...DEFAULTS };

/**
 * Encode current feedback params to a compact query string (e.g. "?p=...").
 */
export function encodeFeedbackParams(params: FeedbackParams): string {
  const arr = [
    round(params.panX),
    round(params.panY),
    round(params.pitch),
    round(params.yaw),
    round(params.distance),
    round(params.flameOffsetX),
    round(params.flameOffsetY),
  ];
  const json = JSON.stringify(arr);
  const encoded = base64UrlEncode(json);
  return `?${PARAM_KEY}=${encoded}`;
}

/**
 * Decode feedback params from the current page URL. Returns null if missing or invalid.
 */
export function decodeFeedbackParamsFromUrl(): FeedbackParams | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const p = params.get(PARAM_KEY);
  if (!p) return null;
  try {
    const json = base64UrlDecode(p);
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr) || arr.length !== 7) return null;
    const [panX, panY, pitch, yaw, distance, flameOffsetX, flameOffsetY] = arr.map(
      (n) => Number(n),
    );
    if (!Number.isFinite(panX + panY + pitch + yaw + distance + flameOffsetX + flameOffsetY)) {
      return null;
    }
    return {
      panX,
      panY,
      pitch,
      yaw,
      distance: Math.max(0.3, Math.min(4, distance)),
      flameOffsetX: Math.max(-0.5, Math.min(0.5, flameOffsetX)),
      flameOffsetY: Math.max(-0.5, Math.min(0.5, flameOffsetY)),
    };
  } catch {
    return null;
  }
}

/**
 * Get current feedback params from URL or defaults.
 */
export function getFeedbackParamsFromUrl(): FeedbackParams {
  return decodeFeedbackParamsFromUrl() ?? { ...DEFAULTS };
}
