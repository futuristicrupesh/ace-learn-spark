import { createFileRoute } from "@tanstack/react-router";
import { streamText, type ModelMessage } from "ai";
import { createLovableAiGatewayProvider, requireGatewayKey } from "@/lib/ai-gateway.server";

type ChatMsg = { role: "user" | "assistant"; content: string };

type ChatBody = {
  messages?: ChatMsg[];
  topic?: string;
  className?: string;
  country?: string;
  educationBoard?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: ChatBody;
        try {
          body = (await request.json()) as ChatBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const history = Array.isArray(body.messages) ? body.messages : [];
        if (history.length === 0) return new Response("No messages", { status: 400 });

        const topic = body.topic || "General";
        const className = body.className || "10th Grade";
        const country = body.country || "USA";
        const board = body.educationBoard || "Standard Board";

        const system = `You are AceCoach — a strict, sharp, highly motivating academic tutor.

Student context:
- Level: ${className}
- Country: ${country}
- Board: ${board}
- Current topic: ${topic}

Coaching rules:
1. Never dump the final answer on the first turn. Ask a targeted probing question or give the smallest useful hint first.
2. Guide step by step. Correct misconceptions the moment they appear.
3. Reveal a full worked solution only after the student has attempted the reasoning, or when they explicitly ask for the solution after at least one hint.
4. Be crisp, encouraging, and exam-focused. End most replies with a short next action.
5. Use markdown: bold for key ideas, lists for steps, code blocks for equations/code.`;

        const modelMessages: ModelMessage[] = history.map(
          (m) => ({ role: m.role, content: m.content }) as ModelMessage,
        );

        try {
          const gateway = createLovableAiGatewayProvider(requireGatewayKey());
          const result = streamText({
            model: gateway("openai/gpt-5.5"),
            instructions: system,
            messages: modelMessages,
          });
          return result.toTextStreamResponse();
        } catch (err) {
          const msg = err instanceof Error ? err.message : "AI error";
          const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});
