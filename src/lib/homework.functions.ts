import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
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
  topic: z.string().min(2),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
});

export const generateHomeworkAndQuiz = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => MissionInput.parse(v))
  .handler(async ({ data }) => {
    const { createLovableAiGatewayProvider, requireGatewayKey } = await import(
      "@/lib/ai-gateway.server"
    );
    const gateway = createLovableAiGatewayProvider(requireGatewayKey(), undefined, {
      structuredOutputs: true,
    });
    const model = gateway("openai/gpt-5.5");

    const prompt = `Generate a rigorous homework mission and revision deck for exam preparation.

Topic: ${data.topic}
Level: ${data.className}
Board: ${data.educationBoard}
Country: ${data.country}

Rules:
- Produce 4 homeworkQuestions: two HARD, two ACE_LEVEL. Each questionText must be exam-quality and fully self-contained. gradingStandard describes what a full-marks answer must include.
- Produce 6 revisionCards. Fronts are prompts or questions; backs are complete, precise answers.
- Use a fresh unique missionId.`;

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: MissionSchema }),
        prompt,
      });
      return output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error("Couldn't build a mission for that topic. Try rephrasing.");
      }
      throw err;
    }
  });

const GradeInput = z.object({
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

export const submitHomework = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => GradeInput.parse(v))
  .handler(async ({ data }) => {
    const { createLovableAiGatewayProvider, requireGatewayKey } = await import(
      "@/lib/ai-gateway.server"
    );
    const gateway = createLovableAiGatewayProvider(requireGatewayKey(), undefined, {
      structuredOutputs: true,
    });
    const model = gateway("openai/gpt-5.5");

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

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: GradeSchema }),
        prompt,
      });
      return output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error("Grading failed to structure. Try again.");
      }
      throw err;
    }
  });
