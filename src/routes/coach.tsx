import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { loadProfile } from "@/lib/profile";
import { RatingPromptDialog, useRatingPrompt } from "@/components/testimonials";
import { Send, Loader2 } from "lucide-react";

export const Route = createFileRoute("/coach")({
  component: CoachPage,
});

type Msg = { role: "user" | "assistant"; content: string };

function CoachPage() {
  const [topic, setTopic] = useState("General");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "**AceCoach here.** Set a topic above, then drop your doubt. I'll hint before I answer — that's how you actually learn." },
  ]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const prompt = useRatingPrompt();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const profile = loadProfile();
    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          topic,
          className: profile?.className,
          country: profile?.country,
          educationBoard: profile?.educationBoard,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(await res.text() || `Request failed (${res.status})`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += value;
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(err instanceof Error ? err.message : "Chat failed");
        setMessages((m) => m.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <section className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Doubt Coach</p>
        <h1 className="mt-1 text-4xl font-semibold">AceCoach won't just hand you the answer.</h1>
        <p className="mt-2 text-muted-foreground">Hints first. Corrections in real time. Solutions only when you've earned them.</p>
      </section>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-xs uppercase tracking-wide text-muted-foreground">Topic</label>
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} className="max-w-sm h-9" />
      </div>

      <Card className="flex flex-col h-[70vh] overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} streaming={streaming && i === messages.length - 1 && m.role === "assistant"} />
          ))}
        </div>
        <div className="border-t border-border p-3 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type your doubt…"
            disabled={streaming}
            className="h-11"
          />
          <Button onClick={send} disabled={streaming || !input.trim()} className="h-11 px-5">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </main>
  );
}

function MessageBubble({ msg, streaming }: { msg: Msg; streaming: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <div className="prose-ace text-sm">
            <ReactMarkdown>{msg.content || (streaming ? "…" : "")}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
