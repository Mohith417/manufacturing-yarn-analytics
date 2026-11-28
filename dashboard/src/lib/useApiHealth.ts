import { useEffect, useState } from "react";
import { fetchHealth, type Health } from "./api";

type Mode = "checking" | "live" | "static";

/**
 * Ask the local API once, keep the answer for the session, and let any page
 * retry. A refused connection is a normal state here, not an error.
 */
let cached: { health: Health | null; at: number } | null = null;
const listeners = new Set<(health: Health | null) => void>();

export function useApiHealth() {
  const [health, setHealth] = useState<Health | null>(cached?.health ?? null);
  const [mode, setMode] = useState<Mode>(cached ? (cached.health ? "live" : "static") : "checking");

  useEffect(() => {
    let alive = true;
    const receive = (next: Health | null) => {
      if (alive) {
        setHealth(next);
        setMode(next ? "live" : "static");
      }
    };
    listeners.add(receive);

    if (!cached || Date.now() - cached.at > 30_000) {
      void fetchHealth().then((next) => {
        cached = { health: next, at: Date.now() };
        listeners.forEach((listener) => listener(next));
      });
    } else if (cached) {
      receive(cached.health);
    }

    return () => {
      alive = false;
      listeners.delete(receive);
    };
  }, []);

  const retry = async () => {
    setMode("checking");
    const next = await fetchHealth();
    cached = { health: next, at: Date.now() };
    listeners.forEach((listener) => listener(next));
  };

  return { health, mode, retry };
}
