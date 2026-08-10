CREATE OR REPLACE FUNCTION public.get_student_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.profiles;
$$;

REVOKE ALL ON FUNCTION public.get_student_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_student_count() TO anon, authenticated, service_role;