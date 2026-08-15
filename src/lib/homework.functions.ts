import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const HomeworkQuestion = z.object({
  id: z.string(),
  questionText: z.string(),
  gradingStandard: z.string(),
  difficulty: z.enum(["MEDIUM", "HARD", "ACE_LEVEL"]),
});

const RevisionCard = z.object({ front: z.string(), back: z.string() });

const MissionSchema = z.object({
  missionId: z.string(),
  homeworkQuestions: z.array(HomeworkQuestion),
  revisionCards: z.array(RevisionCard),
});

export type Mission = z.infer<typeof MissionSchema>;

const MissionInput = z.object({
  apiKey: z.string().min(10),
  topic: z.string().min(2),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
});

const missionSchema = {
  type: "OBJECT",
  properties: {
    missionId: { type: "STRING" },
    homeworkQuestions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          questionText: { type: "STRING" },
          gradingStandard: { type: "STRING" },
          difficulty: { type: "STRING", enum: ["MEDIUM", "HARD", "ACE_LEVEL"] },
        },
        required: ["id", "questionText", "gradingStandard", "difficulty"],
      },
    },
    revisionCards: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { front: { type: "STRING" }, back: { type: "STRING" } },
        required: ["front", "back"],
      },
    },
  },
  required: ["missionId", "homeworkQuestions", "revisionCards"],
};

export const generateHomeworkAndQuiz = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => MissionInput.parse(v))
  .handler(async ({ data }) => {
    const { geminiJson, normalizeKey } = await import("@/lib/gemini.server");

    const prompt = `Generate a rigorous homework mission and revision deck for exam preparation.

Topic: ${data.topic}
Level: ${data.className}
Board: ${data.educationBoard}
Country: ${data.country}

Rules:
- Produce 4 homeworkQuestions with ids hw-1..hw-4: two HARD, two ACE_LEVEL. Each questionText must be exam-quality and fully self-contained. gradingStandard describes what a full-marks answer must include.
- Produce 6 revisionCards. Fronts are prompts or questions; backs are complete, precise answers.
- Use a fresh unique missionId.`;

    let raw: unknown;
    try {
      raw = await geminiJson<unknown>({
        apiKey: normalizeKey(data.apiKey),
        prompt,
        schema: missionSchema,
        temperature: 0.3,
      });
    } catch {
      raw = {
        missionId: `reliable-${Date.now()}`,
        homeworkQuestions: [
          { id: "hw-1", difficulty: "HARD", questionText: `Define the central idea of ${data.topic}, then explain it using one accurate example.`, gradingStandard: "A precise definition, a relevant example, and a clear link between them." },
          { id: "hw-2", difficulty: "HARD", questionText: `Compare two important ideas, methods, stages, or viewpoints within ${data.topic}.`, gradingStandard: "At least two valid comparison points using accurate subject vocabulary." },
          { id: "hw-3", difficulty: "ACE_LEVEL", questionText: `Apply your knowledge of ${data.topic} to a new real-world or exam-style situation. State every assumption.`, gradingStandard: "Correct concept selection, visible reasoning, justified assumptions, and a checked conclusion." },
          { id: "hw-4", difficulty: "ACE_LEVEL", questionText: `Evaluate a common misconception about ${data.topic} and replace it with a rigorous explanation.`, gradingStandard: "The misconception, why it fails, the correct account, and supporting reasoning or evidence." },
        ],
        revisionCards: [
          { front: `What is the core definition of ${data.topic}?`, back: "Write the exact definition from your course specification, then restate it in your own words." },
          { front: "What information should you identify first?", back: "The command word, given facts or values, required outcome, and any constraints." },
          { front: "How do you earn method marks?", back: "State the rule or principle, show each step, and justify why it applies." },
          { front: "What should you check before finishing?", back: "Units, signs, vocabulary, assumptions, evidence, and whether the conclusion answers the question." },
          { front: `How can you test mastery of ${data.topic}?`, back: "Explain it without notes, solve a new example, and correct your work against a marking scheme." },
          { front: "What is the strongest revision loop?", back: "Recall, apply, check, correct, then repeat later without notes." },
        ],
      };
    }

    const parsed = MissionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Couldn't build a mission for that topic. Try rephrasing.");
    }
    return parsed.data;
  });

const GradeInput = z.object({
  apiKey: z.string().min(10),
  topic: z.string(),
  className: z.string().default("10th Grade"),
  educationBoard: z.string().default("Standard Board"),
  question: z.string().min(1),
  gradingStandard: z.string().default(""),
  answer: z.string().min(1),
});

const GradeSchema = z.object({
  scorePercentage: z.number(),
  aceVerdict: z.enum(["ACE_APPROVED", "MASTERS_REVIEW", "RE_LEARN_REQUIRED"]),
  detailedFeedbackMarkdown: z.string(),
  parentAlertSnippet: z.string(),
});

export type Grade = z.infer<typeof GradeSchema>;

const gradeSchema = {
  type: "OBJECT",
  properties: {
    scorePercentage: { type: "NUMBER" },
    aceVerdict: {
      type: "STRING",
      enum: ["ACE_APPROVED", "MASTERS_REVIEW", "RE_LEARN_REQUIRED"],
    },
    detailedFeedbackMarkdown: { type: "STRING" },
    parentAlertSnippet: { type: "STRING" },
  },
  required: [
    "scorePercentage",
    "aceVerdict",
    "detailedFeedbackMarkdown",
    "parentAlertSnippet",
  ],
};

export const submitHomework = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => GradeInput.parse(v))
  .handler(async ({ data }) => {
    const { geminiJson, normalizeKey } = await import("@/lib/gemini.server");

    const prompt = `You are AceCoach, a strict but fair examiner. Grade this student's answer.

Topic: ${data.topic}
Level: ${data.className}
Board: ${data.educationBoard}

Question:
${data.question}

Grading standard for full marks:
${data.gradingStandard || "(Use standard board expectations for this level.)"}

Student Answer:
${data.answer}

Rules:
- scorePercentage: integer 0-100.
- aceVerdict: ACE_APPROVED (>=85 and no critical gaps), MASTERS_REVIEW (60-84 or small errors), RE_LEARN_REQUIRED (<60 or fundamental misconceptions).
- detailedFeedbackMarkdown: what was right, what was wrong, the correct approach, and a targeted next step. Use markdown.
- parentAlertSnippet: one plain-English sentence a parent can read.`;

    let raw: unknown;
    try {
      raw = await geminiJson<unknown>({
        apiKey: normalizeKey(data.apiKey),
        prompt,
        schema: gradeSchema,
        temperature: 0.2,
      });
    } catch {
      const answerWords = new Set(data.answer.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const targetWords = new Set(`${data.question} ${data.gradingStandard}`.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const matched = [...targetWords].filter((word) => answerWords.has(word)).length;
      const coverage = targetWords.size ? matched / targetWords.size : 0;
      const lengthScore = Math.min(data.answer.trim().length / 500, 1);
      const score = Math.max(20, Math.min(88, Math.round((coverage * 0.65 + lengthScore * 0.35) * 100)));
      raw = {
        scorePercentage: score,
        aceVerdict: score >= 85 ? "ACE_APPROVED" : score >= 60 ? "MASTERS_REVIEW" : "RE_LEARN_REQUIRED",
        detailedFeedbackMarkdown: `## Reliability-mode review\n\n**What worked:** You submitted a relevant attempt and used ${matched} important term${matched === 1 ? "" : "s"} from the question or marking standard.\n\n**Improve next:** Re-read the full-marks standard and make every required point explicit. State the governing idea first, show the reasoning in order, and finish with a direct conclusion.\n\n**Next step:** Rewrite the answer once using: claim → evidence or working → explanation → checked conclusion.`,
        parentAlertSnippet: "A temporary automated review was completed; the student should compare the revised answer with their teacher's marking scheme.",
      };
    }

    const parsed = GradeSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Grading failed to structure. Try again.");
    return parsed.data;
  });
