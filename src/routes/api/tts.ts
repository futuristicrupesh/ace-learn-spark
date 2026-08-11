import { createFileRoute } from "@tanstack/react-router";

type TtsBody = { text?: string; voice?: string };

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { geminiTts, normalizeKey, GeminiError } = await import("@/lib/gemini.server");

        let body: TtsBody;
        try {
          body = (await request.json()) as TtsBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text || "").trim();
        if (!text) return new Response("text required", { status: 400 });

        try {
          const apiKey = normalizeKey(request.headers.get("x-user-api-key"));
          const wav = await geminiTts({ apiKey, text, voice: body.voice, signal: request.signal });
          return new Response(wav as unknown as BodyInit, {
            headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          if (err instanceof GeminiError) return new Response(err.message, { status: err.status });
          return new Response(err instanceof Error ? err.message : "TTS error", { status: 500 });
        }
      },
    },
  },
});
