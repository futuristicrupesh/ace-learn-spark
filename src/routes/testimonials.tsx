import { createFileRoute } from "@tanstack/react-router";
import { TestimonialForm, TestimonialList, useTestimonials } from "@/components/testimonials";

export const Route = createFileRoute("/testimonials")({
  head: () => ({
    meta: [
      { title: "Student Testimonials — AceCoach" },
      { name: "description", content: "Read what students say about studying with AceCoach, and share your own experience with lectures, doubt solving and homework grading." },
      { property: "og:title", content: "Student Testimonials — AceCoach" },
      { property: "og:description", content: "Real student stories about lectures, doubt solving and homework grading with AceCoach." },
    ],
  }),
  component: TestimonialsPage,
});

function TestimonialsPage() {
  const { items, loading, refresh } = useTestimonials();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl font-semibold">What students say</h1>
      <p className="mt-2 text-muted-foreground">Every testimonial is saved permanently and shown instantly.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
        <TestimonialList items={items} loading={loading} />
        <TestimonialForm onPosted={refresh} />
      </div>
    </main>
  );
}
