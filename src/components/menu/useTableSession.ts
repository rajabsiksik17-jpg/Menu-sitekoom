"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicSession } from "@/server/sessions";

type Stored = { token: string; seen: number; at: number };
const key = (slug: string, table: string) => `smenu:session:${slug}:${table}`;

function read(k: string | null): Stored | null {
  if (!k) return null;
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "null") as Stored | null;
    return v && typeof v.token === "string" ? v : null;
  } catch { return null; }
}

function write(k: string | null, v: Stored | null) {
  if (!k) return;
  try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* private mode */ }
}

/**
 * The table session of this phone, kept in sync with the server by long polling: one request waits on the server until
 * the session changes (an order accepted, an invoice issued, a request handled, the session closed) and returns at once;
 * the next starts immediately. Network failures back off and recover by themselves; the state shown is always the
 * server's, re-read after any interruption.
 *
 * The notification badge compares the server's customerVersion with the last version this phone has seen (stored), so a
 * refresh never shows old changes as new. When the server answers "ended" (closed and display time over) the token is
 * forgotten — the server refuses it anyway.
 */
export function useTableSession(slug: string, tableToken: string | null) {
  const storageKey = tableToken ? key(slug, tableToken) : null;
  const [token, setTokenState] = useState<string | null>(null);
  const [data, setData] = useState<PublicSession | null>(null);
  const [seen, setSeen] = useState(0);
  const [online, setOnline] = useState(true);
  const [ended, setEnded] = useState(false);
  const adoptSeen = useRef(false); // our own new order: its change is not "news"
  const kick = useRef<() => void>(() => {});

  useEffect(() => {
    const s = read(storageKey);
    if (s) { setTokenState(s.token); setSeen(s.seen); }
  }, [storageKey]);

  /** A new order returned this session token (same table: often the same session). */
  const setToken = useCallback((t: string) => {
    setEnded(false);
    if (t !== token) { setData(null); setSeen(0); adoptSeen.current = true; }
    else adoptSeen.current = true;
    setTokenState(t);
    write(storageKey, { token: t, seen: read(storageKey)?.token === t ? read(storageKey)!.seen : 0, at: Date.now() });
    kick.current();
  }, [token, storageKey]);

  const markSeen = useCallback(() => {
    if (!data || !token) return;
    setSeen(data.customerVersion);
    write(storageKey, { token, seen: data.customerVersion, at: Date.now() });
  }, [data, token, storageKey]);

  useEffect(() => {
    if (!token) return;
    let stop = false;
    let ctrl: AbortController | null = null;
    let version: number | null = null;
    let failures = 0;
    let sleepTimer: ReturnType<typeof setTimeout> | null = null;
    let wake: (() => void) | null = null;
    const sleep = (ms: number) => new Promise<void>((resolve) => { wake = resolve; sleepTimer = setTimeout(resolve, ms); });

    const loop = async () => {
      while (!stop) {
        ctrl = new AbortController();
        try {
          const qs = version === null ? "" : `?v=${version}&wait=20`;
          const res = await fetch(`/api/public/session/${token}${qs}`, { cache: "no-store", signal: ctrl.signal });
          if (res.status === 410 || res.status === 404) {
            write(storageKey, null);
            setEnded(true);
            setData(null);
            setTokenState(null);
            return;
          }
          if (!res.ok) throw new Error(String(res.status));
          const next = (await res.json()) as PublicSession;
          version = next.version;
          setData(next);
          if (adoptSeen.current) {
            adoptSeen.current = false;
            setSeen(next.customerVersion);
            write(storageKey, { token, seen: next.customerVersion, at: Date.now() });
          }
          setOnline(true);
          failures = 0;
        } catch (e) {
          if (stop) return;
          if ((e as Error).name !== "AbortError") {
            failures++;
            setOnline(false);
            await sleep(Math.min(30000, 1500 * 2 ** Math.min(failures, 5)));
          }
        }
      }
    };
    kick.current = () => { version = null; ctrl?.abort(); if (sleepTimer) clearTimeout(sleepTimer); wake?.(); };
    const onVisible = () => { if (!document.hidden) kick.current(); };
    const onOnline = () => kick.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    loop();
    return () => {
      stop = true;
      ctrl?.abort();
      if (sleepTimer) clearTimeout(sleepTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [token, storageKey]);

  const unread = !!data && data.customerVersion > seen;
  return { token, data, online, ended, unread, setToken, markSeen, refresh: () => kick.current() };
}
