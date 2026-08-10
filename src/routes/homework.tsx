import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { loadProfile } from "@/lib/profile";
import {
  generateHomeworkAndQuiz,
  submitHomework,
  type Mission,
  type Grade,
} from "@/lib/homework.functions";
import { RatingPromptDialog, useRatingPrompt } from "@/components/testimonials";
import { Loader2, Sparkles, RotateCw } from "lucide-react";

export const Route = createFileRoute("/homework")({
  component: HomeworkPage,
});

const diffColor: Record<string, string> = {
  MEDIUM: "bg-secondary text-secondary-foreground",
  HARD: "bg-warning/20 text-warning-foreground",
  ACE_LEVEL: "bg-destructive/15 text-destructive",
};

const verdictLabel: Record<string, string> = {
  ACE_APPROVED: "Ace Approved",
  MASTERS_REVIEW: "Master's Review",
  RE_LEARN_REQUIRED: "Re-learn Required",
};
const verdictColor: Record<string, string> = {
  ACE_APPROVED: "bg-success text-success-foreground",
  MASTERS_REVIEW: "bg-warning text-warning-foreground",
  RE_LEARN_REQUIRED: "bg-destructive text-destructive-foreground",
};

function HomeworkPage() {
  const [topic, setTopic] = useState("");
  const [mission, setMission] = useState<Mission | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  const generate = useMutation({
    mutationFn: async () => {
      const p = loadProfile();
      return generateHomeworkAndQuiz({
        data: {
          topic,
          className: p?.className ?? "10th Grade",
          country: p?.country ?? "USA",
          educationBoard: p?.educationBoard ?? "Standard Board",
        },
      });
    },
    onSuccess: (m) => { setMission(m); setAnswers({}); setGrades({}); setFlipped({}); },
    onError: (e: Error) => toast.error(e.message || "Failed to generate mission"),
  });

  const grade = useMutation({
    mutationFn: async (q: Mission["homeworkQuestions"][number]) => {
      const p = loadProfile();
      const result = await submitHomework({
        data: {
          topic: mission?.missionId ? topic : "General",
          className: p?.className ?? "10th Grade",
          educationBoard: p?.educationBoard ?? "Standard Board",
          question: q.questionText,
          gradingStandard: q.gradingStandard,
          answer: answers[q.id] ?? "",
        },
      });
      return { id: q.id, result };
    },
    onSuccess: ({ id, result }) => setGrades((g) => ({ ...g, [id]: result })),
    onError: (e: Error) => toast.error(e.message || "Grading failed"),
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Homework Mission</p>
        <h1 className="mt-1 text-4xl font-semibold">Prove you've mastered it.</h1>
        <p className="mt-2 text-muted-foreground">Exam-quality questions, revision flashcards, and strict AI grading.</p>
      </section>

      <form
        onSubmit={(e) => { e.preventDefault(); if (topic.trim()) generate.mutate(); }}
        className="flex flex-col sm:flex-row gap-3 mb-8"
      >
        <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic to test yourself on" className="h-11" />
        <Button type="submit" disabled={generate.isPending || !topic.trim()} className="h-11 px-6">
          {generate.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Building…</> : <><Sparkles className="h-4 w-4 mr-2" /> Build Mission</>}
        </Button>
      </form>

      {mission && (
        <div className="space-y-10">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Homework</h2>
            <div className="space-y-5">
              {mission.homeworkQuestions.map((q, i) => {
                const g = grades[q.id];
                const isGrading = grade.isPending && grade.variables?.id === q.id;
                return (
                  <Card key={q.id} className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-mono text-muted-foreground">Q{i + 1}</span>
                      <Badge className={diffColor[q.difficulty] ?? ""}>{q.difficulty.replace("_", " ")}</Badge>
                    </div>
                    <p className="font-medium leading-relaxed">{q.questionText}</p>
                    <p className="text-xs text-muted-foreground mt-2"><span className="font-semibold">Full marks:</span> {q.gradingStandard}</p>

                    <Textarea
                      value={answers[q.id] ?? ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Write your best answer…"
                      className="mt-4 min-h-[120px]"
                      disabled={isGrading}
                    />

                    <div className="mt-3 flex justify-end">
                      <Button
                        onClick={() => grade.mutate(q)}
                        disabled={isGrading || !(answers[q.id] ?? "").trim()}
                        variant="outline"
                      >
                        {isGrading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Grading…</> : g ? "Regrade" : "Submit for grading"}
                      </Button>
                    </div>

                    {g && (
                      <div className="mt-5 rounded-lg border border-border bg-muted/30 p-5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge className={verdictColor[g.aceVerdict]}>{verdictLabel[g.aceVerdict]}</Badge>
                          <span className="text-sm font-mono">{g.scorePercentage}%</span>
                          <Progress value={g.scorePercentage} className="flex-1 max-w-xs" />
                        </div>
                        <div className="prose-ace text-sm mt-4">
                          <ReactMarkdown>{g.detailedFeedbackMarkdown}</ReactMarkdown>
                        </div>
                        <p className="text-xs mt-4 text-muted-foreground italic">
                          <span className="font-semibold not-italic">Parent alert:</span> {g.parentAlertSnippet}
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Revision Deck</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {mission.revisionCards.map((c, i) => {
                const isFlipped = !!flipped[i];
                return (
                  <button
                    key={i}
                    onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))}
                    className="text-left"
                  >
                    <Card className={`p-6 min-h-[160px] transition-all ${isFlipped ? "bg-primary text-primary-foreground" : "hover:shadow-[var(--shadow-card)]"}`}>
                      <div className="flex items-center justify-between text-xs opacity-70 mb-2">
                        <span>Card {i + 1}</span>
                        <RotateCw className="h-3 w-3" />
                      </div>
                      <p className="font-medium leading-relaxed">{isFlipped ? c.back : c.front}</p>
                      <p className="mt-3 text-xs opacity-60">{isFlipped ? "Answer · tap to flip" : "Tap to reveal"}</p>
                    </Card>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
