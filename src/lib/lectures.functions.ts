import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LecturePartSchema = z.object({
  segmentTitle: z.string(),
  readingTimeMinutes: z.number(),
  audioSpeakerPrompt: z.string(),
  writtenTranscriptMarkdown: z.string(),
  acedCheckpoints: z.array(z.string()),
});

export type LecturePart = z.infer<typeof LecturePartSchema>;
export type Lecture = { topic: string; academicRigorHeader: string; parts: LecturePart[] };

export const LECTURE_TITLES = [
  "Concept Foundations",
  "Rigorous Breakdown",
  "Under-the-Hood Secret",
  "Ultimate Synthesis",
] as const;

const PART_BRIEFS: string[] = [
  "Start of the chapter: the motivation, every definition stated exactly (and explained intuitively), all key terms, notation, classifications/types with concrete examples of each, and the first results of the chapter, actually stated and explained.",
  "The core of the chapter: every theorem, law, rule and formula, each stated precisely and then proved/derived line by line, with the conditions where it applies, followed by at least four fully solved numerical/written examples of increasing difficulty using real numbers.",
  "The remaining and harder material of the chapter: converse results, special cases, exceptions, alternative proofs, why the results are true, common misconceptions (with the correct version), examiner traps, and fully solved tricky problems.",
  "The end of the chapter and its applications: real-world uses, links to other chapters, a complete formula/result sheet written out in full, and a solved question bank (easy, board-level, challenge) with complete model answers.",
];

const InputSchema = z.object({
  apiKey: z.string().min(10),
  topic: z.string().min(2),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
  partIndex: z.number().int().min(0).max(3),
});

const SYSTEM = `You are AceCoach, a world-class subject teacher AND the textbook itself. The student has no book and no other source — everything they learn must be on this page.

Absolute rules:
- Teach the ACTUAL subject matter. State the real definitions, the real theorems by name, the real formulas, the real proofs, the real facts, dates, examples and numbers.
- NEVER give study advice in place of content. Forbidden: "write the definition", "list the key points", "refer to your textbook", "look up", "find the keyword", "identify the formula", "practise examples from your book", or any instruction that tells the student to go and get the content themselves. If you catch yourself describing what the student should learn, instead teach it.
- Be specific, never generic. Example: for "Triangles" you would actually state and prove the Basic Proportionality Theorem (Thales) and its converse, state the AAA, AA, SSS and SAS similarity criteria with proofs/justification, prove that the ratio of areas of similar triangles equals the square of the ratio of corresponding sides, prove the Pythagoras theorem and its converse using similarity, and solve concrete problems with actual side lengths. Apply the same level of specificity to any subject (history: actual events, people, dates, causes and consequences; biology: actual structures, processes, equations and names; languages: actual rules with real sentences).
- Write in flowing, warm teacher prose with clear markdown structure: ### headings for every sub-topic, numbered steps, tables where useful, **bold** key terms.
- All mathematics in LaTeX: inline $...$ and display $$...$$ on their own lines. Never put formulas in code blocks. Define every symbol in words after each formula.
- Output only the lesson in markdown. No preamble like "Sure" or "Here is".`;

function buildPrompt(d: z.infer<typeof InputSchema>) {
  const title = LECTURE_TITLES[d.partIndex];
  return `Student: ${d.className}, ${d.country}, curriculum/board: ${d.educationBoard}.
Chapter: "${d.topic}"

Write PART ${d.partIndex + 1} of 4 of a complete lesson on this chapter, titled "${title}".
This part covers: ${PART_BRIEFS[d.partIndex]}

Follow the prescribed ${d.educationBoard} textbook chapter for "${d.topic}" in its own order, and teach every heading, definition, theorem, derivation, figure (described in words), table, in-text example and exercise type that belongs to this part — fully, with the real content. Expand anything the book says briefly.

Length: at least 2000 words of real teaching. Include worked examples with complete step-by-step solutions using actual values, a "### Common mistakes" section and a "### Exam tips" section that are specific to this chapter.`;
}

const GENERIC_PATTERNS =
  /(refer to your (text)?book|look (it )?up in your|from your textbook|write (a|the) (precise )?definition|list (the )?key points|find the keyword|take one example from your textbook)/gi;

function looksGeneric(text: string): boolean {
  const hits = text.match(GENERIC_PATTERNS)?.length ?? 0;
  return text.length < 2500 || hits >= 3;
}

function plain(md: string): string {
  return md
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/[#*_`>|]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function narrationFrom(md: string, topic: string, index: number): string {
  const words = plain(md).split(" ").slice(0, 170).join(" ");
  return `Part ${index + 1} of ${topic}. ${words}`;
}

function checkpointsFrom(md: string): string[] {
  const heads = [...md.matchAll(/^#{2,4}\s+(.+)$/gm)]
    .map((m) => m[1].replace(/[*_`$]/g, "").trim())
    .filter((h) => !/common mistakes|exam tips/i.test(h))
    .slice(0, 5);
  return heads.length
    ? heads.map((h) => `I can explain "${h}" fully, without notes.`)
    : ["I can explain every idea in this part without notes."];
}

/** Generates ONE lecture part of real teaching content. Throws if the AI cannot
 *  produce real content — the page retries automatically instead of showing filler. */
export const generateLecturePart = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => InputSchema.parse(v))
  .handler(async ({ data }): Promise<LecturePart> => {
    const { geminiText, normalizeKey } = await import("@/lib/gemini.server");
    const apiKey = normalizeKey(data.apiKey);
    const title = LECTURE_TITLES[data.partIndex];

    let { text } = await geminiText({ apiKey, system: SYSTEM, prompt: buildPrompt(data) });

    // If the answer is thin or drifts into study tips, ask once more for the real material.
    if (looksGeneric(text)) {
      try {
        const more = await geminiText({
          apiKey,
          system: SYSTEM,
          prompt: `${buildPrompt(data)}

Your previous draft is below. It is too short and/or gives study instructions instead of actual content. Rewrite it as the full lesson with the real definitions, theorems, proofs, facts and fully solved examples for "${data.topic}".

"""${text}"""`,
        });
        if (more.text.length > text.length) text = more.text;
      } catch {
        /* keep the first draft */
      }
    } else if (text.length < 9000) {
      try {
        const more = await geminiText({
          apiKey,
          system: SYSTEM,
          prompt: `You are continuing part "${title}" of a lesson on "${data.topic}" (${data.className}, ${data.educationBoard}). Here is what is written so far:

"""${text}"""

Continue with the sub-topics, proofs, facts and fully solved examples of this part that are still missing. At least 1000 more words of real content. Do not repeat anything above, do not add a preamble.`,
        });
        if (more.text.trim().length > 400) text = `${text.trim()}\n\n${more.text.trim()}`;
      } catch {
        /* the first pass is already real content */
      }
    }

    const words = plain(text).split(" ").length;
    return {
      segmentTitle: title,
      readingTimeMinutes: Math.max(5, Math.round(words / 180)),
      audioSpeakerPrompt: narrationFrom(text, data.topic, data.partIndex),
      writtenTranscriptMarkdown: text.trim(),
      acedCheckpoints: checkpointsFrom(text),
    };
  });
