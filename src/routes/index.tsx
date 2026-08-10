import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  loadProfile,
  saveProfile,
  fetchRemoteProfile,
  saveRemoteProfile,
  type StudentProfile,
} from "@/lib/profile";
import { useAuth } from "@/hooks/use-auth";
import { CommunityProof, useTestimonials } from "@/components/testimonials";
import { BookOpen, MessageSquare, PencilRuler, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

const BOARDS = ["CBSE", "ICSE", "IB", "Cambridge IGCSE", "A-Levels", "AP", "State Board", "Standard Board"];
const CLASSES = ["6th Grade","7th Grade","8th Grade","9th Grade","10th Grade","11th Grade","12th Grade","University"];

function Home() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { items: testimonials, loading: testimonialsLoading } = useTestimonials();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<StudentProfile>({
    userId: "",
    studentName: "",
    className: "10th Grade",
    country: "USA",
    educationBoard: "Standard Board",
    examPrepTime: "3 months",
    parentEmail: "",
    dailyTaskGoal: 3,
  });

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      if (user) {
        const remote = await fetchRemoteProfile(user.id);
        if (cancelled) return;
        if (remote) {
          saveProfile(remote);
          setProfile(remote);
          setForm(remote);
        } else {
          const local = loadProfile();
          setForm((f) => ({ ...(local ?? f), userId: user.id }));
        }
      } else {
        const p = loadProfile();
        if (p) setProfile(p);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: StudentProfile = {
      ...form,
      userId: user?.id || form.userId || crypto.randomUUID(),
      studentName: form.studentName.trim() || "Student",
    };
    saveProfile(next);
    setProfile(next);
    if (user) {
      try {
        await saveRemoteProfile(next);
        toast.success("Profile saved to your account.");
      } catch {
        toast.error("Could not save your profile to the cloud.");
      }
    }
  }

  if (!ready) return null;


  if (profile) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-10">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</p>
          <h1 className="mt-1 text-4xl font-semibold">Hi {profile.studentName}, ready to ace it?</h1>
          <p className="mt-2 text-muted-foreground">
            {profile.className} · {profile.educationBoard} · Daily goal: {profile.dailyTaskGoal} tasks
          </p>
        </section>

        <div className="grid gap-5 md:grid-cols-3">
          <ActionCard
            icon={<BookOpen className="h-5 w-5" />}
            title="Generate a Lecture"
            desc="4-part narrated lecture with checkpoints and transcript."
            onClick={() => navigate({ to: "/lecture" })}
          />
          <ActionCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Solve a Doubt"
            desc="AceCoach guides you with hints, not answers."
            onClick={() => navigate({ to: "/coach" })}
          />
          <ActionCard
            icon={<PencilRuler className="h-5 w-5" />}
            title="Homework & Quiz"
            desc="Exam-grade questions, strict AI grading, revision cards."
            onClick={() => navigate({ to: "/homework" })}
          />
        </div>

        <div className="mt-10 flex items-center gap-5">
          <button
            onClick={() => { setProfile(null); setForm({ ...form, userId: user?.id ?? "", studentName: profile.studentName }); }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Edit profile
          </button>
          <Link to="/testimonials" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4">
            Share a testimonial
          </Link>
          {!user && (
            <Link to="/auth" className="text-xs text-accent-foreground underline underline-offset-4">
              Sign in to save your profile forever
            </Link>
          )}
        </div>

      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="h-3 w-3" /> AI Exam Tutor
          </span>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.05]">
            Ace every exam with a coach who <em className="font-serif italic text-accent">refuses to give up on you</em>.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Full narrated lectures, hint-based doubt solving, and exam-grade homework — all graded strictly by AceCoach.
          </p>
          {!user && (
            <p className="mt-4 text-sm">
              <Link to="/auth" className="underline underline-offset-4">Create a free account</Link> to keep your profile and progress forever.
            </p>
          )}

        </div>

        <Card className="p-6 shadow-[var(--shadow-focus)]">
          <h2 className="text-xl font-semibold">Set up your profile</h2>
          <form onSubmit={submit} className="mt-5 grid gap-4">
            <Field label="Your name">
              <Input required value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} placeholder="e.g. Aarav" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Class">
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })}>
                  {CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Board">
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.educationBoard} onChange={(e) => setForm({ ...form, educationBoard: e.target.value })}>
                  {BOARDS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country">
                <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </Field>
              <Field label="Exam in">
                <Input value={form.examPrepTime} onChange={(e) => setForm({ ...form, examPrepTime: e.target.value })} placeholder="3 months" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily task goal">
                <Input type="number" min={1} max={10} value={form.dailyTaskGoal} onChange={(e) => setForm({ ...form, dailyTaskGoal: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Parent email (optional)">
                <Input type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} placeholder="parent@..." />
              </Field>
            </div>
            <Button type="submit" className="mt-2">Start training</Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ActionCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left group">
      <Card className="p-6 h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-focus)]">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        <span className="mt-4 inline-block text-sm text-accent-foreground/80 group-hover:text-accent-foreground">Open →</span>
      </Card>
    </button>
  );
}
