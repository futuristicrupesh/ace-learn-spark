import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadProfile } from "@/lib/profile";
import { generateChapterOutline, generateLecturePart, LECTURE_TITLES, type LecturePart } from "@/lib/lectures.functions";
import { RatingPromptDialog, useRatingPrompt } from "@/components/testimonials";
import { ApiKeyGate } from "@/components/api-key-gate";
import { useApiKey, loadApiKey } from "@/lib/user-api-key";
import { Play, Pause, Loader2, CheckCircle2, RotateCw } from "lucide-react";

export const Route = createFileRoute("/lecture")({
  head: () => ({
    meta: [
      { title: "Lecture Studio — AceCoach" },
      { name: "description", content: "Full-chapter lectures with real definitions, proofs, worked examples and narration." },
      { property: "og:title", content: "Lecture Studio — AceCoach" },
      { property: "og:description", content: "Full-chapter lectures with real definitions, proofs, worked examples and narration." },
    ],
  }),
  component: LecturePage,
});

type Slot =
  | { status: "writing"; attempt: number }
  | { status: "ready"; part: LecturePart }
  | { status: "failed"; message: string };

const MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function LecturePage() {
  const [topic, setTopic] = useState("");
  const [shownTopic, setShownTopic] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [active, setActive] = useState(0);
  const [mapping, setMapping] = useState(false);
  const runId = useRef(0);
  const outlineRef = useRef<string | undefined>(undefined);
  const prompt = useRatingPrompt();
  const { apiKey } = useApiKey();

  const setSlot = (run: number, i: number, slot: Slot) => {
    if (run !== runId.current) return;
    setSlots((prev) => (prev ? prev.map((s, j) => (j === i ? slot : s)) : prev));
  };

  /** Maps the chapter's real named content first so every part is specific. */
  async function mapChapter(run: number, subject: string): Promise<string | undefined> {
    const profile = loadProfile();
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (run !== runId.current) return undefined;
      try {
        const { outline } = await generateChapterOutline({
          data: {
            apiKey: apiKey || loadApiKey(),
            topic: subject,
            className: profile?.className ?? "10th Grade",
            country: profile?.country ?? "USA",
            educationBoard: profile?.educationBoard ?? "Standard Board",
          },
        });
        return outline;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/isn't valid|No Google AI key/i.test(msg)) return undefined;
        await sleep(3000 * attempt);
      }
    }
    // Parts can still be written without the map.
    return undefined;
  }

  async function writePart(run: number, i: number, subject: string, outline?: string): Promise<boolean> {
    const profile = loadProfile();
    let lastMessage = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (run !== runId.current) return false;
      setSlot(run, i, { status: "writing", attempt });
      try {
        const part = await generateLecturePart({
          data: {
            apiKey: apiKey || loadApiKey(),
            topic: subject,
            partIndex: i,
            outline,
            className: profile?.className ?? "10th Grade",
            country: profile?.country ?? "USA",
            educationBoard: profile?.educationBoard ?? "Standard Board",
          },
        });
        setSlot(run, i, { status: "ready", part });
        return true;
      } catch (e) {
        lastMessage = e instanceof Error ? e.message : String(e);
        // Invalid key won't fix itself by waiting.
        if (/isn't valid|No Google AI key/i.test(lastMessage)) break;
        await sleep(Math.min(4000 * attempt, 20000));
      }
    }
    setSlot(run, i, { status: "failed", message: lastMessage });
    return false;
  }

  async function start() {
    const subject = topic.trim();
    if (!subject) return;
    const run = ++runId.current;
    setShownTopic(subject);
    setActive(0);
    setSlots(LECTURE_TITLES.map(() => ({ status: "writing", attempt: 1 }) as Slot));
    setMapping(true);
    outlineRef.current = undefined;
    const outline = await mapChapter(run, subject);
    if (run === runId.current) outlineRef.current = outline;
    if (run === runId.current) setMapping(false);
    if (run !== runId.current) return;
    // Part 1 first so the student can start reading, then the rest (staggered to
    // stay within free-key rate limits).
    const first = writePart(run, 0, subject, outline);
    await sleep(2500);
    const rest = [1, 2, 3].map(async (i, k) => {
      await sleep(k * 2500);
      return writePart(run, i, subject, outline);
    });
    const results = await Promise.all([first, ...rest]);
    if (run === runId.current && results.some(Boolean)) {
      setTimeout(() => prompt.ask("your lecture"), 1200);
    }
  }

  const busy = !!slots?.some((s) => s.status === "writing");
  const current = slots?.[active];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Lecture Studio</p>
        <h1 className="mt-1 text-4xl font-semibold">Learn a topic, deeply.</h1>
        <p className="mt-2 text-muted-foreground">Four rigorous parts. Narration. Full transcript. Mastery checkpoints.</p>
      </section>

      <ApiKeyGate>
      <form
        onSubmit={(e) => { e.preventDefault(); void start(); }}
        className="flex flex-col sm:flex-row gap-3 mb-8"
      >
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Triangles, Photosynthesis, French Revolution"
          className="h-11"
        />
        <Button type="submit" disabled={busy || !topic.trim()} className="h-11 px-6">
          {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Writing…</> : "Generate Lecture"}
        </Button>
      </form>

      {slots && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-20 h-fit space-y-2">
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Topic</p>
              <p className="mt-1 font-semibold">{shownTopic}</p>
              <p className="mt-3 text-sm text-primary italic font-serif">
                Every definition, theorem, proof and worked example of {shownTopic}.
              </p>
              {mapping && (
                <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Mapping every section of the chapter…
                </p>
              )}
            </div>
            <div className="space-y-1">
              {slots.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                    i === active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span className="text-xs opacity-70 flex items-center gap-1.5">
                    Part {i + 1}
                    {s.status === "writing" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {s.status === "ready" && <CheckCircle2 className="h-3 w-3" />}
                  </span>
                  <div className="font-medium">{LECTURE_TITLES[i]}</div>
                </button>
              ))}
            </div>
          </aside>

          {current?.status === "ready" ? (
            <LecturePartView part={current.part} index={active} />
          ) : current?.status === "failed" ? (
            <Card className="p-10 text-center">
              <p className="font-medium">This part is taking longer than usual.</p>
              <p className="mt-2 text-sm text-muted-foreground">{current.message}</p>
              <Button
                className="mt-5 gap-2"
                onClick={() => void writePart(runId.current, active, shownTopic, outlineRef.current)}
              >
                <RotateCw className="h-4 w-4" /> Write this part again
              </Button>
            </Card>
          ) : (
            <Card className="p-10 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
              AceCoach is writing Part {active + 1}: {LECTURE_TITLES[active]} — the full chapter content, with proofs and solved examples.
              {current?.status === "writing" && current.attempt > 1 && (
                <p className="mt-2 text-xs">The AI is busy right now, still working on it…</p>
              )}
            </Card>
          )}
        </div>
      )}

      </ApiKeyGate>

      <RatingPromptDialog open={prompt.open} onOpenChange={prompt.setOpen} context={prompt.context} />
    </main>
  );
}

function LecturePartView({ part, index }: { part: LecturePart; index: number }) {
  return (
    <Card className="p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Badge variant="secondary" className="mb-2">Part {index + 1} · ~{part.readingTimeMinutes} min</Badge>
          <h2 className="text-3xl font-semibold">{part.segmentTitle}</h2>
        </div>
        <AudioPlayer text={part.audioSpeakerPrompt} key={index} />
      </div>

      <Markdown className="prose-ace mt-6">{part.writtenTranscriptMarkdown}</Markdown>

      <div className="mt-8 rounded-lg border border-accent/30 bg-accent/5 p-5">
        <p className="text-xs uppercase tracking-wide text-accent-foreground/70 font-semibold">Aced Checkpoints</p>
        <ul className="mt-3 space-y-2">
          {part.acedCheckpoints.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-accent mt-0.5 shrink-0" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}


function AudioPlayer({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    audioRef.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  async function play() {
    if (audioRef.current && urlRef.current) {
      await audioRef.current.play();
      setStatus("playing");
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-api-key": loadApiKey() },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(await res.text() || "TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setStatus("idle");
      audio.onpause = () => setStatus((s) => (s === "playing" ? "paused" : s));
      audio.onplay = () => setStatus("playing");
      audioRef.current = audio;
      await audio.play();
      setStatus("playing");
    } catch (err) {
      // Never leave the student stuck: fall back to the browser's own voice.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.rate = 1;
          utter.onend = () => setStatus("idle");
          speechRef.current = utter;
          window.speechSynthesis.speak(utter);
          setStatus("playing");
          toast.message("Using your device's voice for narration.");
          return;
        } catch {
          /* fall through to error */
        }
      }
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "Audio failed");
    }
  }

  function pause() {
    audioRef.current?.pause();
    if (speechRef.current && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      speechRef.current = null;
    }
    setStatus("paused");
  }

  const isPlaying = status === "playing";
  return (
    <Button
      variant="outline"
      onClick={isPlaying ? pause : play}
      disabled={status === "loading"}
      className="gap-2"
    >
      {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      {status === "loading" ? "Loading…" : isPlaying ? "Pause narration" : "Listen"}
    </Button>
  );
}
