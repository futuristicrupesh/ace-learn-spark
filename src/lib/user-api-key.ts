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

/** Accepts every Google credential style: standard keys (AIza…), OAuth access tokens
 *  (ya29…), AQ.… tokens, JWT-style auth tokens, and any other opaque token. */
export function looksLikeGoogleKey(key: string) {
  const k = key.trim().replace(/^Bearer\s+/i, "");
  if (k.length < 15) return false;
  if (/\s/.test(k)) return false;
  return true;
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
