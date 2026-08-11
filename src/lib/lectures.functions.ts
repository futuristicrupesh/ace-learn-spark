import { createServerFn } from "@tanstack/react-start";
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
  apiKey: z.string().min(10),
  topic: z.string().min(2),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
});

const responseSchema = {
  type: "OBJECT",
  properties: {
    topic: { type: "STRING" },
    academicRigorHeader: { type: "STRING" },
    parts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          segmentTitle: { type: "STRING" },
          readingTimeMinutes: { type: "NUMBER" },
          audioSpeakerPrompt: { type: "STRING" },
          writtenTranscriptMarkdown: { type: "STRING" },
          acedCheckpoints: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: [
          "segmentTitle",
          "readingTimeMinutes",
          "audioSpeakerPrompt",
          "writtenTranscriptMarkdown",
          "acedCheckpoints",
        ],
      },
    },
  },
  required: ["topic", "academicRigorHeader", "parts"],
};

export const generateLecture = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }) => {
    const { geminiJson, normalizeKey } = await import("@/lib/gemini.server");

    const prompt = `You are AceCoach, an elite academic tutor. Create a rigorous 4-part lecture for exam preparation.

Student:
- Level: ${data.className}
- Country: ${data.country}
- Board/Curriculum: ${data.educationBoard}
- Topic: ${data.topic}

Rules:
- Return exactly 4 parts in this order: "Concept Foundations", "Rigorous Breakdown", "Under-the-Hood Secret", "Ultimate Synthesis".
- Each part: readingTimeMinutes ~8-12; audioSpeakerPrompt is a 100-140 word narration script written for text-to-speech (natural spoken English, no markdown, no headings, no bullet symbols); writtenTranscriptMarkdown is a detailed markdown lesson with examples, formulas, and worked problems where relevant; acedCheckpoints is 2-4 crisp mastery checks.
- academicRigorHeader is a bold, motivating one-liner tying the topic to exam success.
- Use board-appropriate depth and vocabulary.`;

    const raw = await geminiJson<unknown>({
      apiKey: normalizeKey(data.apiKey),
      prompt,
      schema: responseSchema,
      temperature: 0.3,
    });

    const parsed = LectureSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("The tutor couldn't structure the lecture. Try a more specific topic.");
    }
    return parsed.data;
  });
