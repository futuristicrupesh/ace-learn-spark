import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { KeyRound, ExternalLink, ShieldCheck, Trash2 } from "lucide-react";
import { useApiKey, looksLikeGoogleKey } from "@/lib/user-api-key";

export function ApiKeyForm({ compact = false }: { compact?: boolean }) {
  const { apiKey, hasKey, set, clear } = useApiKey();
  const [value, setValue] = useState("");

  function save() {
    const key = value.trim();
    if (!key) return;
    if (!looksLikeGoogleKey(key)) {
      toast.error("That doesn't look like a Google AI key — it should start with AIza.");
      return;
    }
    set(key);
    setValue("");
    toast.success("Key saved. AceCoach now runs on your own free Google AI key.");
  }

  if (hasKey) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-md bg-success/10 px-3 py-1.5 text-sm text-success-foreground">
          <ShieldCheck className="h-4 w-4" />
          Your key is connected · ••••{apiKey.slice(-4)}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => {
            clear();
            toast.success("Key removed from this browser.");
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          type="password"
          autoComplete="off"
          placeholder="Paste your key (starts with AIza…)"
          className="h-11"
        />
        <Button onClick={save} disabled={!value.trim()} className="h-11 px-6">
          Connect key
        </Button>
      </div>
      <a
        href="https://aistudio.google.com/apikey"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        Get a free key from Google AI Studio <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/** Blocks AI features until the student has connected their own key. */
export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { hasKey, ready } = useApiKey();
  if (!ready) return null;
  if (hasKey) return <>{children}</>;

  return (
    <Card className="p-8">
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-3">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">Connect your own AI key to start</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-prose">
            AceCoach runs on your personal Google AI key, so your usage is yours alone — nobody
            else's studying can slow you down or run out your limit. It's free to create, takes
            about 30 seconds, and it stays saved in this browser only.
          </p>
          <ol className="mt-4 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
            <li>Open Google AI Studio and sign in with any Google account.</li>
            <li>Click "Create API key" and copy it.</li>
            <li>Paste it below — that's it.</li>
          </ol>
          <div className="mt-5">
            <ApiKeyForm />
          </div>
        </div>
      </div>
    </Card>
  );
}
