import { EventEmitter } from "node:events";

/**
 * In-process wake-up signals for long polling (a new order wakes the waiting POS request at once).
 * Only a hint: the order itself is always in the database, and pollers re-read it, so a lost signal costs at most
 * one poll interval. With several server instances, pollers still work (they also re-check on a timer).
 */
const g = globalThis as unknown as { __bus?: EventEmitter };
const bus = (g.__bus ??= new EventEmitter().setMaxListeners(0));

export function notify(channel: string) {
  bus.emit(channel);
}

export function waitFor(channel: string, ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      clearTimeout(timer);
      bus.off(channel, onEvent);
      signal?.removeEventListener("abort", onAbort);
      resolve(v);
    };
    const onEvent = () => done(true);
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    bus.on(channel, onEvent);
    signal?.addEventListener("abort", onAbort);
  });
}

export const channels = {
  restaurantOrders: (restaurantId: string) => `orders:${restaurantId}`,
};
