CREATE TABLE public.lecture_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  part_index integer NOT NULL,
  content jsonb NOT NULL,
  model text,
  quality integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cache_key, part_index)
);
GRANT ALL ON public.lecture_cache TO service_role;
ALTER TABLE public.lecture_cache ENABLE ROW LEVEL SECURITY;