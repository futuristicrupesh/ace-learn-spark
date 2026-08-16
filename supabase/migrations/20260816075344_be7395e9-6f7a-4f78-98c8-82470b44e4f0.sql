DROP POLICY IF EXISTS "Anyone can post a testimonial" ON public.testimonials;

CREATE POLICY "Signed-in students post their own testimonial"
ON public.testimonials
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND char_length(name) BETWEEN 1 AND 80
  AND char_length(message) BETWEEN 1 AND 1000
  AND rating BETWEEN 1 AND 5
);