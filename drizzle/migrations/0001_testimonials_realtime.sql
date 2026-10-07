ALTER TABLE public.testimonials REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.testimonials;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;