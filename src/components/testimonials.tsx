import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";

export type Testimonial = {
  id: string;
  name: string;
  role: string | null;
  message: string;
  rating: number;
  created_at: string;
};

export function useTestimonials() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const { data } = await supabase
      .from("testimonials")
      .select("id, name, role, message, rating, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as Testimonial[]);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { items, loading, refresh };
}

export function Stars({ value }: { value: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= value ? "fill-accent text-accent" : "text-muted-foreground/40"}`}
        />
      ))}
    </div>
  );
}

export function TestimonialList({ items, loading }: { items: Testimonial[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading testimonials…</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No testimonials yet — be the first to share yours.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((t) => (
        <Card key={t.id} className="p-5">
          <Stars value={t.rating} />
          <p className="mt-3 text-sm leading-relaxed">{t.message}</p>
          <p className="mt-4 text-sm font-medium">{t.name}</p>
          {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
        </Card>
      ))}
    </div>
  );
}

export function TestimonialForm({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanMessage = message.trim();
    if (!cleanName || cleanName.length > 80) return toast.error("Please enter your name (max 80 chars).");
    if (!cleanMessage || cleanMessage.length > 1000) return toast.error("Message must be 1–1000 characters.");

    setBusy(true);
    const { error } = await supabase.from("testimonials").insert({
      user_id: user?.id ?? null,
      name: cleanName,
      role: role.trim() || null,
      message: cleanMessage,
      rating,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Thanks! Your testimonial is live.");
    setName("");
    setRole("");
    setMessage("");
    setRating(5);
    onPosted();
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Share your experience</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your name</Label>
            <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Class / role (optional)</Label>
            <Input maxLength={80} value={role} onChange={(e) => setRole(e.target.value)} placeholder="12th Grade, CBSE" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Rating</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} star`}>
                <Star className={`h-6 w-6 ${i <= rating ? "fill-accent text-accent" : "text-muted-foreground/40"}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Your testimonial</Label>
          <Textarea required maxLength={1000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Posting…" : "Post testimonial"}</Button>
      </form>
    </Card>
  );
}
