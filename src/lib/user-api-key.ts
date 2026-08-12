import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "ace.googleApiKey";

/** The user's own Google AI key lives only in their browser — never in our database. */
export function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string) {
  try {
    localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("ace-api-key-change"));
}

export function clearApiKey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("ace-api-key-change"));
}

/** Accepts both standard Google AI keys (AIza…) and auth/OAuth access tokens (ya29… or JWTs). */
export function looksLikeGoogleKey(key: string) {
  const k = key.trim().replace(/^Bearer\s+/i, "");
  if (/^AIza[\w-]{20,}$/.test(k)) return true; // standard API key
  if (/^ya29\.[\w./-]{20,}$/.test(k)) return true; // OAuth access token
  if (k.split(".").length === 3 && k.length > 40) return true; // JWT-style auth token
  return false;
}

export function useApiKey() {
  const [apiKey, setKey] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setKey(loadApiKey());
    sync();
    setReady(true);
    window.addEventListener("ace-api-key-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ace-api-key-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((value: string) => saveApiKey(value), []);
  const clear = useCallback(() => clearApiKey(), []);

  return { apiKey, hasKey: apiKey.length > 0, ready, set, clear };
}
