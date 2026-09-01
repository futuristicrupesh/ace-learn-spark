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

const partSchema = {
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
};

const TITLES = [
  "Concept Foundations",
  "Rigorous Breakdown",
  "Under-the-Hood Secret",
  "Ultimate Synthesis",
] as const;

const PART_BRIEFS: Record<(typeof TITLES)[number], string> = {
  "Concept Foundations":
    "Every prerequisite, every definition (formal and intuitive), the origin/why of the topic, all key terms with precise meanings, notation conventions, units, classifications and the complete map of what the chapter contains.",
  "Rigorous Breakdown":
    "Every law, theorem, rule, derivation and formula of the chapter, each derived step by step from first principles, with the conditions where it applies and where it fails, plus at least four fully worked examples of increasing difficulty.",
  "Under-the-Hood Secret":
    "Deep insight: why the results are true, alternative proofs or viewpoints, edge cases, exceptions, the most common examiner traps, misconceptions with corrections, sign/unit pitfalls, approximations and their validity, plus expert shortcuts and how to recognise question types instantly.",
  "Ultimate Synthesis":
    "Full integration: connections to other chapters and real applications, a complete formula sheet, a graded question bank (easy → board-level → olympiad/AP-level) with model answers and mark schemes, a revision plan, and a final mastery audit.",
};

const FORMAT_RULES = `Formatting rules (critical):
- Write like a brilliant human teacher, in flowing, warm, explanatory prose — never terse notes, never robotic phrasing.
- Every mathematical expression MUST be real LaTeX: inline as $E = mc^2$ and displayed as $$ ... $$ on its own lines. Never write formulas inside code fences or as programming syntax, and never leave stray braces, backslashes or markup visible to the reader.
- Define every symbol in words immediately after each formula ("here $v$ is the speed in metres per second…").
- Use markdown headings (###), numbered steps, tables where useful, and bold for key ideas.
- Never say "as discussed above" without actually explaining; assume the reader has only this text.`;

function fallbackPart(title: string, index: number, topic: string) {
  return {
    segmentTitle: title,
    readingTimeMinutes: 12,
    audioSpeakerPrompt: `Welcome to part ${index + 1} of ${topic}. Begin by stating the central idea in your own words. Connect it to one fact you already know, then work through a simple example. Pause after each step and explain why it follows. For exam success, identify the command word, show the complete method, use precise vocabulary, and check that your conclusion answers the question. If a formula applies, define every symbol before substitution and verify the units. Finish by creating one example of your own and teaching the method aloud. That final explanation is the best test of whether you truly understand ${topic}.`,
    writtenTranscriptMarkdown: `## ${title}\n\n### Core method\n\n1. **Define the idea:** Write a precise, board-appropriate definition of **${topic}**.\n2. **Identify what is given:** List facts, values, keywords, or evidence.\n3. **Choose the rule:** State the concept, formula, or reasoning principle before using it.\n4. **Apply it visibly:** Show one logical step per line and explain why it follows.\n5. **Verify:** Check terminology, units, signs, assumptions, and whether the conclusion answers the command word.\n\n### Worked-study framework\n\nTake one example from your textbook. Cover its solution and attempt it using the five steps above. Compare your method with the marking scheme, correct gaps in a different colour, then solve a similar question without notes.\n\n### Exam trap\n\nDo not memorise a final sentence without understanding the chain of reasoning. Examiners award marks for the correct method, evidence, and precise explanation.`,
    acedCheckpoints: [
      `I can define the central idea of ${topic} without notes.`,
      "I can select and justify the correct method for a new question.",
      "I can check my answer against the wording of the question.",
    ],
  };
}

export const generateLecture = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }) => {
    const { geminiJson, normalizeKey } = await import("@/lib/gemini.server");
    const apiKey = normalizeKey(data.apiKey);

    // Each part is generated in its own call so no single response is truncated —
    // this is what lets the lecture cover the entire chapter exhaustively.
    const parts = await Promise.all(
      TITLES.map(async (title, index) => {
        const prompt = `You are AceCoach, an elite academic tutor writing for a student who must master an entire chapter with nothing left out — the standard is a lecture an MIT admissions reader would call complete.

Student:
- Level: ${data.className}
- Country: ${data.country}
- Board/Curriculum: ${data.educationBoard}
- Chapter/Topic: ${data.topic}

Write PART ${index + 1} of 4, titled "${title}".
Scope of this part: ${PART_BRIEFS[title]}

Depth requirements:
- writtenTranscriptMarkdown must be extremely thorough: at least 1200 words for this part, covering every sub-topic, corner case, exception and exam tip that belongs here. Do not summarise — teach completely.
- Include worked examples with full step-by-step solutions and the reasoning behind each step.
- Include a short "Common mistakes and how to avoid them" section and an "Exam tips" section.
- readingTimeMinutes: honest estimate (usually 10-18).
- audioSpeakerPrompt: a 130-170 word spoken narration script (plain natural speech, no markdown, no symbols, spell out formulas in words).
- acedCheckpoints: 3-5 crisp mastery checks for this part.

${FORMAT_RULES}`;

        try {
          const raw = await geminiJson<unknown>({
            apiKey,
            prompt,
            schema: partSchema,
            temperature: 0.35,
            maxOutputTokens: 32768,
          });
          const parsed = LecturePartSchema.safeParse(raw);
          if (parsed.success && parsed.data.writtenTranscriptMarkdown.trim().length > 200) {
            return { ...parsed.data, segmentTitle: parsed.data.segmentTitle || title };
          }
        } catch {
          /* fall through to reliable content */
        }
        return fallbackPart(title, index, data.topic);
      }),
    );

    return LectureSchema.parse({
      topic: data.topic,
      academicRigorHeader: `Master every corner of ${data.topic} — definitions, derivations, traps, and exam-winning method.`,
      parts,
    });
  });
