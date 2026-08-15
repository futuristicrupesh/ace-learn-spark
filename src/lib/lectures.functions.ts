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

    let raw: unknown;
    try {
      raw = await geminiJson<unknown>({
        apiKey: normalizeKey(data.apiKey),
        prompt,
        schema: responseSchema,
        temperature: 0.3,
      });
    } catch {
      const titles = ["Concept Foundations", "Rigorous Breakdown", "Under-the-Hood Secret", "Ultimate Synthesis"];
      raw = {
        topic: data.topic,
        academicRigorHeader: `Master ${data.topic} by explaining the idea, applying it, and checking every step.`,
        parts: titles.map((title, index) => ({
          segmentTitle: title,
          readingTimeMinutes: 8,
          audioSpeakerPrompt: `Welcome to part ${index + 1} of ${data.topic}. Begin by stating the central idea in your own words. Connect it to one fact you already know, then work through a simple example. Pause after each step and explain why it follows. For exam success, identify the command word, show the complete method, use precise vocabulary, and check that your conclusion answers the question. If a formula applies, define every symbol before substitution and verify the units. Finish by creating one example of your own and teaching the method aloud. That final explanation is the best test of whether you truly understand ${data.topic}.`,
          writtenTranscriptMarkdown: `## ${title}\n\n### Core method\n\n1. **Define the idea:** Write a precise, board-appropriate definition of **${data.topic}**.\n2. **Identify what is given:** List facts, values, keywords, or evidence.\n3. **Choose the rule:** State the concept, formula, or reasoning principle before using it.\n4. **Apply it visibly:** Show one logical step per line and explain why it follows.\n5. **Verify:** Check terminology, units, signs, assumptions, and whether the conclusion answers the command word.\n\n### Worked-study framework\n\nTake one example from your textbook. Cover its solution and attempt it using the five steps above. Compare your method with the marking scheme, correct gaps in a different colour, then solve a similar question without notes.\n\n### Exam trap\n\nDo not memorise a final sentence without understanding the chain of reasoning. Examiners award marks for the correct method, evidence, and precise explanation.`,
          acedCheckpoints: [
            `I can define the central idea of ${data.topic} without notes.`,
            "I can select and justify the correct method for a new question.",
            "I can check my answer against the wording of the question.",
          ],
        })),
      };
    }

    const parsed = LectureSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("The tutor couldn't structure the lecture. Try a more specific topic.");
    }
    return parsed.data;
  });
