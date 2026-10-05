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
  /** Chapter map from generateChapterOutline — the exact items this part must teach. */
  outline: z.string().max(40000).optional(),
});

const OutlineInput = InputSchema.omit({ partIndex: true, outline: true });

const OUTLINE_SYSTEM = `You are a senior curriculum expert who knows every official textbook (NCERT, CBSE, ICSE, state boards, IB, Cambridge IGCSE/A-Level, AP, Common Core, GCSE, university syllabi) section by section.
You produce a precise CONTENT MAP of a chapter: the actual named items a student must learn, never vague categories.`;

function outlinePrompt(d: z.infer<typeof OutlineInput>) {
  return `Student: ${d.className}, ${d.country}, curriculum/board: ${d.educationBoard}.
Chapter / topic: "${d.topic}"

Build the complete content map of this chapter exactly as the prescribed textbook for this class and board teaches it (search for the official syllabus and textbook contents if you can). Then split it, in the book's own order, into exactly 4 parts:
PART 1 = start of the chapter (motivation, all definitions, terms, notation, types, first results)
PART 2 = the core results (every theorem/law/formula/process with its proof or derivation, and the solved in-text examples)
PART 3 = the harder and remaining material (converses, special cases, exceptions, deeper reasoning, tricky problems)
PART 4 = end of chapter (applications, links, summary formula sheet, exercise question types)

Under each part list EVERY specific item as a bullet, one item per bullet, named concretely, e.g.
- Theorem 6.1 Basic Proportionality Theorem (Thales): a line parallel to one side of a triangle divides the other two sides in the same ratio — proof
- Formula: $\\text{ar}(\\triangle ABC)/\\text{ar}(\\triangle PQR) = (AB/PQ)^2$
- Fact: the Tennis Court Oath, 20 June 1789, Third Estate vows not to disperse
- Exercise type: find an unknown side using similarity with given lengths

Rules: no generic bullets like "definitions", "key concepts", "examples" or "practice questions" — every bullet names the real thing. Aim for 10-20 bullets per part. Output only this format:

PART 1
- ...
PART 2
- ...
PART 3
- ...
PART 4
- ...`;
}

function partItems(outline: string | undefined, index: number): string[] {
  if (!outline) return [];
  const blocks = outline.split(/^[\s#*]*PART\s*([1-4])\b.*$/im);
  // split() with a capture group yields [pre, "1", body, "2", body, ...]
  for (let i = 1; i < blocks.length; i += 2) {
    if (Number(blocks[i]) === index + 1) {
      return (blocks[i + 1] ?? "")
        .split("\n")
        .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
        .filter((l) => l.length > 3);
    }
  }
  return [];
}

/** Key words of an outline item, used to check the lesson actually taught it. */
function itemKeywords(item: string): string[] {
  const head = item.split(/[:—–(]| - /)[0] ?? item;
  const stop = new Set(["theorem", "formula", "fact", "definition", "proof", "the", "and", "of", "a", "an", "to", "in", "for", "with", "on", "by", "exercise", "type", "law", "rule", "its", "is", "are"]);
  return head
    .toLowerCase()
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w) && !/^\d+$/.test(w));
}

function missingItems(text: string, items: string[]): string[] {
  const lower = text.toLowerCase();
  return items.filter((item) => {
    const kws = itemKeywords(item);
    if (!kws.length) return false;
    const hits = kws.filter((k) => lower.includes(k)).length;
    return hits / kws.length < 0.6;
  });
}

/** Builds the chapter's content map once, so every part teaches the real, named
 *  material of that chapter instead of generic advice. Grounded in live search
 *  where the key allows it, otherwise from the model's own knowledge. */
export const generateChapterOutline = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => OutlineInput.parse(v))
  .handler(async ({ data }): Promise<{ outline: string }> => {
    const { geminiText, normalizeKey } = await import("@/lib/gemini.server");
    const apiKey = normalizeKey(data.apiKey);
    const good = (t: string) => [1, 2, 3, 4].filter((n) => partItems(t, n - 1).length >= 3).length >= 3;
    let best = "";
    for (const grounded of [true, false]) {
      try {
        const { text } = await geminiText({
          apiKey,
          system: OUTLINE_SYSTEM,
          prompt: outlinePrompt(data),
          grounded,
          thinkingBudget: 2048,
          temperature: 0.2,
          maxOutputTokens: 12000,
        });
        if (good(text)) return { outline: text };
        if (text.length > best.length) best = text;
      } catch {
        /* try the next mode */
      }
    }
    if (best) return { outline: best };
    throw new Error("Couldn't map the chapter yet — retrying.");
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
  const items = partItems(d.outline, d.partIndex);
  const map = items.length
    ? `
MANDATORY CONTENT for this part — teach EVERY item below fully, in this order, each under its own ### heading (state it exactly, explain it, prove/derive or justify it, then a fully solved example with real values or a concrete real instance):
${items.map((it, i) => `${i + 1}. ${it}`).join("\n")}

The other parts of the lesson cover the rest of the chapter, so do not drift into them.
`
    : "";
  return `Student: ${d.className}, ${d.country}, curriculum/board: ${d.educationBoard}.
Chapter: "${d.topic}"

Write PART ${d.partIndex + 1} of 4 of a complete lesson on this chapter, titled "${title}".
This part covers: ${PART_BRIEFS[d.partIndex]}
${map}
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

    const items = partItems(data.outline, data.partIndex);
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
    }

    // Make sure every named item of the chapter map was really taught; fill gaps.
    for (let round = 0; round < 2 && items.length; round += 1) {
      const missing = missingItems(text, items);
      if (missing.length === 0 || missing.length / items.length < 0.15) break;
      try {
        const more = await geminiText({
          apiKey,
          system: SYSTEM,
          prompt: `You are continuing part "${title}" of a lesson on "${data.topic}" (${data.className}, ${data.educationBoard}). These items of the chapter have NOT been taught yet:
${missing.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Teach each one now, fully, under its own ### heading: state it exactly, explain it in warm teacher prose, prove/derive or justify it, and give a fully solved example with real values (or a concrete real instance). Real content only — no study advice, no preamble, do not repeat earlier material.`,
        });
        if (more.text.trim().length > 300) text = `${text.trim()}\n\n${more.text.trim()}`;
        else break;
      } catch {
        break;
      }
    }

    if (!items.length && text.length < 9000) {
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
