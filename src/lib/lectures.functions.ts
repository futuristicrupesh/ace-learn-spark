import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";

const LecturePartSchema = z.object({
  segmentTitle: z.string(),
  readingTimeMinutes: z.number(),
  audioSpeakerPrompt: z.string(),
  writtenTranscriptMarkdown: z.string(),
  acedCheckpoints: z.array(z.string()),
});

const LectureSchema = z.object({
  topic: z.string(),
  academicRigorHeader: z.string(),
  parts: z.array(LecturePartSchema),
});

export type Lecture = z.infer<typeof LectureSchema>;

const InputSchema = z.object({
  topic: z.string().min(2),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
});

export const generateLecture = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }) => {
    const { createLovableAiGatewayProvider, requireGatewayKey } = await import(
      "@/lib/ai-gateway.server"
    );
    const gateway = createLovableAiGatewayProvider(requireGatewayKey(), undefined, {
      structuredOutputs: true,
    });
    const model = gateway("openai/gpt-5.5");

    const prompt = `You are AceCoach, an elite academic tutor. Create a rigorous 4-part lecture for exam preparation.

Student:
- Level: ${data.className}
- Country: ${data.country}
- Board/Curriculum: ${data.educationBoard}
- Topic: ${data.topic}

Rules:
- Return exactly 4 parts in this order: "Concept Foundations", "Rigorous Breakdown", "Under-the-Hood Secret", "Ultimate Synthesis".
- Each part: readingTimeMinutes ~8-12; audioSpeakerPrompt is a 100-140 word narration script written for TTS (natural spoken English, no markdown, no headings, no bullet symbols); writtenTranscriptMarkdown is a detailed markdown lesson with examples, formulas, and worked problems where relevant; acedCheckpoints is 2-4 crisp mastery checks.
- academicRigorHeader is a bold, motivating one-liner tying the topic to exam success.
- Use board-appropriate depth and vocabulary.`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: LectureSchema }),
        prompt,
      });
      return output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error("The tutor couldn't structure the lecture. Try a more specific topic.");
      }
      throw err;
    }
  });
