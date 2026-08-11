import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { clearProfile } from "@/lib/profile";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">This page hasn't been written yet.</p>
        <Link to="/" className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Back to AceCoach
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AceCoach — AI Exam Tutor" },
      { name: "description", content: "AceCoach is a strict, motivating AI tutor: full lectures with narration, hint-based doubt solving, and exam-grade homework with instant grading." },
      { property: "og:title", content: "AceCoach — AI Exam Tutor" },
      { property: "og:description", content: "Full lectures, hint-based doubt solving, and exam-grade homework grading." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Instrument+Sans:wght@400;500;600&display=swap" },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function Nav() {
  const link = "text-sm text-muted-foreground hover:text-foreground transition-colors";
  const active = "text-foreground font-medium";
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { queryClient } = Route.useRouteContext();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    clearProfile();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">A</span>
          <span className="font-serif text-lg tracking-tight">AceCoach</span>
        </Link>
        <nav className="flex items-center gap-5">
          <Link to="/lecture" className={link} activeProps={{ className: active }}>Lecture</Link>
          <Link to="/coach" className={link} activeProps={{ className: active }}>Doubt Coach</Link>
          <Link to="/homework" className={link} activeProps={{ className: active }}>Homework</Link>
          <Link to="/testimonials" className={link} activeProps={{ className: active }}>Testimonials</Link>
          <Link to="/settings" className={link} activeProps={{ className: active }}>AI Key</Link>

          {!loading && (user ? (
            <button onClick={signOut} className={link}>Sign out</button>
          ) : (
            <Link to="/auth" className={link} activeProps={{ className: active }}>Sign in</Link>
          ))}
        </nav>
      </div>
    </header>
  );
}


function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <Nav />
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
