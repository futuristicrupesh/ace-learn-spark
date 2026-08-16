import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Star, BadgeCheck, Users, MessageSquareQuote } from "lucide-react";


export type Testimonial = {
  id: string;
  user_id: string | null;
  name: string;
  role: string | null;
  message: string;
  rating: number;
  created_at: string;
};

export function useTestimonials() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("testimonials")
      .select("id, user_id, name, role, message, rating, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Testimonial[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, refresh };
}

/** Public count of students who created an account. */
export function useStudentCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_student_count").then(({ data }) => {
      if (!cancelled && typeof data === "number") setCount(data);
    });
    return () => { cancelled = true; };
  }, []);
  return count;
}

export function Stars({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${cls} ${i <= value ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
      ))}
      <span className="ml-1.5 text-xs font-medium text-muted-foreground">{value}/5</span>
    </div>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "S";
}

export function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <Card className="p-5 flex flex-col">
      <Stars value={t.rating} />
      <p className="mt-3 flex-1 text-sm leading-relaxed">{t.message}</p>
      <div className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(t.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <span className="truncate">{t.name}</span>
            {t.user_id && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified account" />}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t.role || (t.user_id ? "Verified student account" : "Guest student")}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function TestimonialList({ items, loading }: { items: Testimonial[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading testimonials…</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No testimonials yet — be the first to share yours.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((t) => <TestimonialCard key={t.id} t={t} />)}
    </div>
  );
}

function average(items: Testimonial[]) {
  if (items.length === 0) return 0;
  return Math.round((items.reduce((s, t) => s + t.rating, 0) / items.length) * 10) / 10;
}

/** Public stats + testimonial wall shown on the landing page. */
export function CommunityProof({ items, loading }: { items: Testimonial[]; loading: boolean }) {
  const students = useStudentCount();
  const avg = average(items);
  return (
    <section className="mt-16">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={<Users className="h-5 w-5" />} value={students === null ? "—" : students.toLocaleString()} label="Students on AceCoach" />
        <StatCard icon={<MessageSquareQuote className="h-5 w-5" />} value={items.length.toLocaleString()} label="Student testimonials" />
        <StatCard icon={<Star className="h-5 w-5 fill-accent text-accent" />} value={avg ? `${avg}/5` : "—"} label="Average rating" />
      </div>

      <div className="mt-10 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Loved by students</h2>
          <p className="mt-1 text-sm text-muted-foreground">Real reviews, rated out of five.</p>
        </div>
        {avg > 0 && <Stars value={Math.round(avg)} size="md" />}
      </div>
      <div className="mt-6">
        <TestimonialList items={items.slice(0, 6)} loading={loading} />
      </div>
    </section>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <Card className="p-5">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </Card>
  );
}

/** The locked display name for the signed-in student. */
export function useDisplayName() {
  const { user } = useAuth();
  if (!user) return "";
  const meta = user.user_metadata as { student_name?: string; full_name?: string; name?: string } | undefined;
  return meta?.student_name || meta?.full_name || meta?.name || user.email?.split("@")[0] || "Student";
}

function SignInToRate({ title = "Sign in to rate AceCoach" }: { title?: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {title} — only signed-in students can post a rating, and your name comes from your account.
      </p>
      <Button asChild className="w-fit">
        <Link to="/auth">Sign in</Link>
      </Button>
    </div>
  );
}

function useSubmitTestimonial() {
  const { user } = useAuth();
  const name = useDisplayName();
  const [busy, setBusy] = useState(false);

  async function submit(values: { role: string; message: string; rating: number }) {
    if (!user) { toast.error("Please sign in to post a rating."); return false; }
    const cleanMessage = values.message.trim();
    if (!cleanMessage || cleanMessage.length > 1000) { toast.error("Message must be 1–1000 characters."); return false; }
    setBusy(true);
    const { error } = await supabase.from("testimonials").insert({
      user_id: user.id,
      name,
      role: values.role.trim() || null,
      message: cleanMessage,
      rating: values.rating,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    toast.success("Thanks! Your rating is live.");
    return true;
  }

  return { submit, busy };
}


function RatingPicker({ rating, setRating }: { rating: number; setRating: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} star`}>
          <Star className={`h-7 w-7 transition-transform hover:scale-110 ${i <= rating ? "fill-accent text-accent" : "text-muted-foreground/40"}`} />
        </button>
      ))}
      <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
    </div>
  );
}

export function TestimonialForm({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const name = useDisplayName();
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const { submit, busy } = useSubmitTestimonial();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ role, message, rating });
    if (!ok) return;
    setRole(""); setMessage(""); setRating(5);
    onPosted();
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Share your experience</h2>
      {!user ? (
        <div className="mt-4"><SignInToRate /></div>
      ) : (
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your name</Label>
            <Input value={name} readOnly disabled className="bg-muted/50" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Class / role (optional)</Label>
            <Input maxLength={80} value={role} onChange={(e) => setRole(e.target.value)} placeholder="12th Grade, CBSE" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rating</Label>
          <RatingPicker rating={rating} setRating={setRating} />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your testimonial</Label>
          <Textarea required maxLength={1000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Posting…" : "Post testimonial"}</Button>
      </form>
      )}
    </Card>
  );
}


/**
 * Asks the student to rate AceCoach right after they finish an AI task.
 * Call `ask()` when a lecture, doubt answer or grading completes.
 */
export function useRatingPrompt() {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("your session");
  const [asked, setAsked] = useState(false);

  const ask = useCallback((label: string) => {
    setContext(label);
    setAsked((prev) => {
      if (!prev) setOpen(true);
      return true;
    });
  }, []);

  return { open, setOpen, context, ask, asked };
}

export function RatingPromptDialog({
  open,
  onOpenChange,
  context,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  context: string;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const { submit, busy } = useSubmitTestimonial();

  useEffect(() => {
    const meta = user?.user_metadata as { student_name?: string } | undefined;
    if (user && !name) setName(meta?.student_name || user.email?.split("@")[0] || "");
  }, [user, name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ name, role: "", message, rating });
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How was {context}?</DialogTitle>
          <DialogDescription>Rate AceCoach out of five and leave a testimonial — it shows on the homepage instantly.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <RatingPicker rating={rating} setRating={setRating} />
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your name</Label>
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your testimonial</Label>
            <Textarea required maxLength={1000} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What worked for you?" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">{busy ? "Posting…" : "Post rating"}</Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Later</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
