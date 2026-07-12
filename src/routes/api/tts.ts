import { createFileRoute } from "@tanstack/react-router";
import { requireGatewayKey } from "@/lib/ai-gateway.server";

type TtsBody = { text?: string; voice?: string };

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: TtsBody;
        try {
          body = (await request.json()) as TtsBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const text = (body.text || "").trim();
        if (!text) return new Response("text required", { status: 400 });

        try {
          const key = requireGatewayKey();
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Lovable-API-Key": key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text,
              voice: body.voice || "alloy",
              response_format: "mp3",
            }),
            signal: request.signal,
          });
          if (!upstream.ok) {
            const errText = await upstream.text().catch(() => "");
            return new Response(errText || "TTS failed", { status: upstream.status });
          }
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          const msg = err instanceof Error ? err.message : "TTS error";
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
