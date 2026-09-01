import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { loadProfile } from "@/lib/profile";
import { generateLecture, type Lecture } from "@/lib/lectures.functions";
import { RatingPromptDialog, useRatingPrompt } from "@/components/testimonials";
import { ApiKeyGate } from "@/components/api-key-gate";
import { useApiKey, loadApiKey } from "@/lib/user-api-key";
import { Play, Pause, Loader2, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/lecture")({
  component: LecturePage,
});

function LecturePage() {
  const [topic, setTopic] = useState("");
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [active, setActive] = useState(0);
  const prompt = useRatingPrompt();
  const { apiKey } = useApiKey();

  const mutation = useMutation({
    mutationFn: async () => {
      const profile = loadProfile();
      return generateLecture({
        data: {
          apiKey,
          topic,
          className: profile?.className ?? "10th Grade",
          country: profile?.country ?? "USA",
          educationBoard: profile?.educationBoard ?? "Standard Board",
        },
      });
    },
    onSuccess: (data) => {
      setLecture(data);
      setActive(0);
      setTimeout(() => prompt.ask("your lecture"), 1200);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to generate lecture"),
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Lecture Studio</p>
        <h1 className="mt-1 text-4xl font-semibold">Learn a topic, deeply.</h1>
        <p className="mt-2 text-muted-foreground">Four rigorous parts. Narration. Full transcript. Mastery checkpoints.</p>
      </section>

      <ApiKeyGate>
      <form
        onSubmit={(e) => { e.preventDefault(); if (topic.trim()) mutation.mutate(); }}
        className="flex flex-col sm:flex-row gap-3 mb-8"
      >
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Photosynthesis, Quadratic Equations, French Revolution"
          className="h-11"
        />
        <Button type="submit" disabled={mutation.isPending || !topic.trim()} className="h-11 px-6">
          {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : "Generate Lecture"}
        </Button>
      </form>

      {mutation.isPending && (
        <Card className="p-10 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
          AceCoach is drafting a rigorous 4-part lecture…
        </Card>
      )}

      {lecture && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="lg:sticky lg:top-20 h-fit space-y-2">
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Topic</p>
              <p className="mt-1 font-semibold">{lecture.topic}</p>
              <p className="mt-3 text-sm text-primary italic font-serif">{lecture.academicRigorHeader}</p>
            </div>
            <div className="space-y-1">
              {lecture.parts.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors ${
                    i === active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span className="text-xs opacity-70">Part {i + 1}</span>
                  <div className="font-medium">{p.segmentTitle}</div>
                </button>
              ))}
            </div>
          </aside>

          <LecturePart part={lecture.parts[active]} index={active} />
        </div>
      )}

      </ApiKeyGate>

      <RatingPromptDialog open={prompt.open} onOpenChange={prompt.setOpen} context={prompt.context} />
    </main>
  );
}

function LecturePart({ part, index }: { part: Lecture["parts"][number]; index: number }) {
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
