// Server-only helpers that call Google Gemini with the END USER'S own API key.
// No shared/app key is ever used for AI work.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

// Model IDs are tried in order; if one is retired/unavailable for a given key
// we automatically fall back to the next so students never see a hard failure.
export const TEXT_MODELS = [
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
];
export const TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];
export const TEXT_MODEL = TEXT_MODELS[0];
export const TTS_MODEL = TTS_MODELS[0];

/** True when the failure is "this model isn't available", so another model may work. */
function isModelUnavailable(status: number, body: string): boolean {
  if (status === 404) return true;
  return /no longer available|not found|not supported|unsupported model|does not exist|migrate-to-interactions/i.test(
    body,
  );
}

function isTransientFailure(status: number, body: string): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    /high demand|overloaded|temporarily unavailable|resource exhausted|try again later/i.test(body)
  );
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 15_000);
  }
  return Math.min(600 * 2 ** attempt + Math.random() * 400, 8_000);
}

async function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Request cancelled", "AbortError"));
      },
      { once: true },
    );
  });
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) {
    throw new GeminiError(
      "No Google AI key found. Add your free key in Settings to use the AI features.",
      401,
    );
  }
  return key;
}

function friendlyError(status: number, body: string): GeminiError {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    detail = parsed.error?.message ?? body;
  } catch {
    /* keep raw */
  }
  if (status === 400 && /api key not valid|API_KEY_INVALID/i.test(detail)) {
    return new GeminiError("That Google AI key isn't valid. Check it in Settings.", 401);
  }
  if (status === 429) {
    return new GeminiError(
      "Your Google AI key hit its rate limit. Wait a minute and try again.",
      429,
    );
  }
  if (isModelUnavailable(status, detail)) {
    return new GeminiError(
      "Your Google AI key can't reach any available Gemini model right now. Generate a fresh key at aistudio.google.com and paste it in the AI Key page.",
      status === 404 ? 404 : status,
    );
  }
  if (status === 403) {
    return new GeminiError(
      "Your Google AI key doesn't have access to this model. Create a new key at aistudio.google.com.",
      403,
    );
  }
  return new GeminiError(detail || `AI request failed (${status})`, status);
}

/** Standard API keys (AIza…) go in the query string; every other credential type
 *  (OAuth access tokens ya29…, AQ.… tokens, JWTs, service tokens) is sent as a bearer header.
 *  If the first mode is rejected, we automatically retry with the other one. */
export function isOAuthToken(key: string): boolean {
  return !/^AIza[\w-]{10,}$/.test(key.trim());
}

function endpointFor(model: string, method: string, apiKey: string, extra: string, asBearer: boolean): string {
  const base = `${BASE}/models/${model}:${method}`;
  const q = extra ? `?${extra}` : "";
  if (asBearer) return `${base}${q}`;
  return `${base}${q ? q + "&" : "?"}key=${encodeURIComponent(apiKey)}`;
}

function headersFor(apiKey: string, asBearer: boolean): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (asBearer) {
    h["Authorization"] = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey.replace(/^Bearer\s+/i, "")}`;
  } else {
    h["x-goog-api-key"] = apiKey;
  }
  return h;
}

/** Calls Gemini, transparently trying both credential styles so any key type works. */
export async function geminiFetch(opts: {
  model: string | string[];
  method: string;
  apiKey: string;
  body: unknown;
  extra?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const key = opts.apiKey.trim();
  const modes = isOAuthToken(key) ? [true, false] : [false, true];
  const models = Array.isArray(opts.model) ? opts.model : [opts.model];
  let last: Response | null = null;
  // Older models reject `thinkingConfig`; if that happens we drop it and retry.
  let body = opts.body;
  let strippedThinking = false;
  const stripThinking = (input: unknown): unknown => {
    const clone = JSON.parse(JSON.stringify(input)) as {
      generationConfig?: Record<string, unknown>;
    };
    if (clone.generationConfig) delete clone.generationConfig["thinkingConfig"];
    return clone;
  };
  for (const model of models) {
    for (const asBearer of modes) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let res: Response;
        try {
          res = await fetch(endpointFor(model, opts.method, key, opts.extra ?? "", asBearer), {
            method: "POST",
            headers: headersFor(key, asBearer),
            signal: opts.signal,
            body: JSON.stringify(body),
          });
        } catch (error) {
          if (opts.signal?.aborted) throw error;
          if (attempt < 2) {
            await waitForRetry(600 * 2 ** attempt + Math.random() * 400, opts.signal);
            continue;
          }
          last = new Response("The AI service could not be reached.", { status: 503 });
          break;
        }
        if (res.ok) return res;
        const text = await res.text().catch(() => "");
        if (res.status === 400 && !strippedThinking && /thinking/i.test(text)) {
          strippedThinking = true;
          body = stripThinking(body);
          attempt -= 1;
          continue;
        }
        last = new Response(text, {
          status: res.status,
          headers: { "retry-after": res.headers.get("retry-after") ?? "" },
        });
        if (isTransientFailure(res.status, text) && attempt < 2) {
          await waitForRetry(retryDelay(res, attempt), opts.signal);
          continue;
        }
        break;
      }


      if (!last) continue;
      const errBody = await last.clone().text().catch(() => "");
      if (isModelUnavailable(last.status, errBody) || isTransientFailure(last.status, errBody)) break;

      if (![400, 401, 403].includes(last.status)) break;
    }
  }
  return last ?? new Response("The AI service could not be reached.", { status: 503 });
}


type JsonSchema = Record<string, unknown>;

export async function geminiJson<T>(opts: {
  apiKey: string;
  prompt: string;
  schema: JsonSchema;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const res = await geminiFetch({
    model: TEXT_MODELS,
    method: "generateContent",
    apiKey: opts.apiKey,
    signal: opts.signal,
    body: {
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.3,
        maxOutputTokens: opts.maxOutputTokens ?? 16384,
        // Without this the 2.5 "thinking" models spend the entire output budget on
        // internal reasoning and return an EMPTY answer, which is what silently
        // pushed every lecture/homework onto the generic fallback text.
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: "application/json",
        responseSchema: opts.schema,
      },
    },
  });


  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""));

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new GeminiError(
      `The AI returned an empty response (${data.candidates?.[0]?.finishReason ?? "unknown"}).`,
      502,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        /* fall through to salvage below */
      }
    }
    // A truncated JSON object still holds most of the lecture — repair it rather
    // than throwing the whole generation away.
    const salvaged = repairJson(text);
    if (salvaged) return salvaged as T;
    throw new GeminiError("The AI response couldn't be parsed. Try again.", 502);
  }
}

/** Plain-text (markdown) generation. Far more robust than JSON for long teaching
 *  content: nothing to parse, and an answer that hits the length limit is still usable. */
export async function geminiText(opts: {
  apiKey: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<{ text: string; finishReason: string }> {
  const res = await geminiFetch({
    model: TEXT_MODELS,
    method: "generateContent",
    apiKey: opts.apiKey,
    signal: opts.signal,
    body: {
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 32768,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  });
  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""));
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  };
  const cand = data.candidates?.[0];
  const text =
    cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new GeminiError(`The AI returned an empty response (${cand?.finishReason ?? "unknown"}).`, 502);
  }
  return { text: text.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, "$1"), finishReason: cand?.finishReason ?? "" };
}


/** Best-effort repair of JSON that was cut off mid-string / mid-object. */
function repairJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let s = text.slice(start);
  // close an unterminated string
  const quotes = (s.match(/(?<!\\)"/g) ?? []).length;
  if (quotes % 2 === 1) s += '"';
  // close any open brackets
  const stack: string[] = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i += 1;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  s = s.replace(/,\s*$/, "");
  while (stack.length) s += stack.pop() === "{" ? "}" : "]";
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}


/** Streams plain text deltas as a Response body. */
export async function geminiStreamText(opts: {
  apiKey: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
}): Promise<Response> {
  const upstream = await geminiFetch({
    model: TEXT_MODELS,
    method: "streamGenerateContent",
    extra: "alt=sse",
    apiKey: opts.apiKey,
    signal: opts.signal,
    body: {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16384,
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  });


  if (!upstream.ok || !upstream.body) {
    throw friendlyError(upstream.status, await upstream.text().catch(() => ""));
  }

  const reader = upstream.body.pipeThrough(new TextDecoderStream()).getReader();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[];
          };
          const text =
            chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        } catch {
          /* ignore partial frames */
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1, bits = 16): Uint8Array {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bits, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(buffer);
  out.set(pcm, 44);
  return out;
}

export async function geminiTts(opts: {
  apiKey: string;
  text: string;
  voice?: string;
  signal?: AbortSignal;
}): Promise<Uint8Array> {
  const res = await geminiFetch({
    model: TTS_MODELS,
    method: "generateContent",
    apiKey: opts.apiKey,
    signal: opts.signal,
    body: {
      contents: [{ role: "user", parts: [{ text: opts.text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice || "Kore" } },
        },
      },
    },
  });


  if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""));

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData
    ?.data;
  if (!b64) throw new GeminiError("No narration audio was returned. Try again.", 502);

  const binary = atob(b64);
  const pcm = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) pcm[i] = binary.charCodeAt(i);
  return pcmToWav(pcm);
}
