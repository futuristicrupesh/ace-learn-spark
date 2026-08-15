import { createFileRoute } from "@tanstack/react-router";

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
        const { geminiStreamText, normalizeKey, GeminiError } = await import(
          "@/lib/gemini.server"
        );

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

        try {
          const apiKey = normalizeKey(request.headers.get("x-user-api-key"));
          return await geminiStreamText({
            apiKey,
            system,
            messages: history
              .filter((m) => m && typeof m.content === "string" && m.content.trim())
              .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
            signal: request.signal,
          });
        } catch (err) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          const lastQuestion = history.filter((message) => message.role === "user").at(-1)?.content;
          const fallback = `**Let's keep learning — step by step.**\n\nThe live tutor is briefly busy, so use this reliable exam method for **${topic}**:\n\n1. Write down exactly what the question gives you.\n2. Name the rule, formula, or key concept that connects those facts.\n3. Apply it one step at a time and check units, signs, and keywords.\n4. Compare your result with what the question actually asks.\n\n**Your next move:** Tell me what you already know about “${lastQuestion ?? topic}” and the first step you tried. I’ll help you isolate the gap.`;
          const message = err instanceof GeminiError && err.status < 500 && err.status !== 429
            ? `${fallback}\n\n_Your saved AI key may need refreshing in AI Key settings._`
            : fallback;
          return new Response(message, {
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
