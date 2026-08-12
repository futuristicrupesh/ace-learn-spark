import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/api-key-gate";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Your AI Key — AceCoach" },
      {
        name: "description",
        content:
          "Connect your own free Google AI key so AceCoach lectures, doubt solving and grading run on your personal quota.",
      },
      { property: "og:title", content: "Your AI Key — AceCoach" },
      {
        property: "og:description",
        content:
          "Connect your own free Google AI key so AceCoach runs on your personal quota.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <section className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Settings</p>
        <h1 className="mt-1 text-4xl font-semibold">Your AI key</h1>
        <p className="mt-2 text-muted-foreground">
          Every student uses their own free Google AI key, so one person's studying can never use up
          another's.
        </p>
      </section>

      <Card className="p-8">
        <ApiKeyForm />
        <div className="mt-8 space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">How to get one (free, ~30 seconds)</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Open{" "}
              <a
                className="text-primary hover:underline"
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
              >
                aistudio.google.com/apikey
              </a>{" "}
              and sign in with any Google account.
            </li>
            <li>Click "Create API key".</li>
            <li>Copy it and paste it above.</li>
          </ol>
          <p>
            <strong className="text-foreground">
              All key types work here — standard API keys (AIza…), auth / OAuth access tokens
              (ya29…), AQ.… tokens (e.g. AQ.Ab8RN6…), JWT-style auth tokens, and any other Google
              credential.
            </strong>{" "}
            Paste whichever one you have — AceCoach detects the type and sends it the correct way,
            and automatically retries the other way if needed.
          </p>

          <p>
            <strong className="text-foreground">
              Ran out of credits? You can always generate a brand-new API key — it's free and takes
              seconds.
            </strong>{" "}
            Just open Google AI Studio again, click "Create API key", and paste the new one above.
          </p>
          <p>
            <strong className="text-foreground">
              Key storage full? Delete the API keys you don't use anymore and create new ones.
            </strong>{" "}
            Google limits how many keys a project can hold, so removing old keys instantly frees up
            room for fresh ones.
          </p>
          <p className="flex items-start gap-2 pt-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-success" />
            Your key is stored only in this browser. It is never saved to our database and is sent
            straight to Google for your own lessons.
          </p>
        </div>
      </Card>
    </main>
  );
}
