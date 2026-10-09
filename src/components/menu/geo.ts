"use client";

export type GeoFix = { lat: number; lng: number; accuracy: number; capturedAt: number };
export type GeoFailure = "denied" | "unavailable" | "timeout" | "unsupported";

/** One fresh, high-accuracy reading (no cached position): used right before submitting an order. */
export function getFix(timeoutMs = 15000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return reject("unsupported" satisfies GeoFailure);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: p.timestamp || Date.now() }),
      (e) => reject((e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable") satisfies GeoFailure),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
