import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LecturePartSchema = z.object({
  segmentTitle: z.string(),
  readingTimeMinutes: z.number(),
  audioSpeakerPrompt: z.string(),
  writtenTranscriptMarkdown: z.string(),
  acedCheckpoints: z.array(z.string()),
});

export type LecturePart = z.infer<typeof LecturePartSchema> & {
  /** True when only a lighter AI model was available (e.g. the student's daily limit on the best model ran out). */
  lightModel?: boolean;
};
export type Lecture = { topic: string; academicRigorHeader: string; parts: LecturePart[] };

export const LECTURE_TITLES = [
  "Concept Foundations",
  "Rigorous Breakdown",
  "Under-the-Hood Secret",
  "Ultimate Synthesis",
] as const;

// Bump when prompts change so old saved lessons are not reused.
const CACHE_VERSION = "v3";

const PART_BRIEFS: string[] = [
  "Start of the chapter: the motivation, every definition stated exactly (and explained intuitively), all key terms, notation, classifications/types with concrete examples of each, and the first results of the chapter, actually stated and explained.",
  "The core of the chapter: every theorem, law, rule, process, event or formula, each stated precisely and then proved/derived/explained step by step, with the conditions where it applies, followed by at least four fully solved examples of increasing difficulty using real numbers or real cases.",
  "The remaining and harder material of the chapter: converse results, special cases, exceptions, alternative proofs or interpretations, why the results are true, common misconceptions (with the correct version), examiner traps, and fully solved tricky problems.",
  "The end of the chapter and its applications: real-world uses, links to other chapters, a complete formula/fact/result sheet written out in full, and a solved question bank (easy, board-level, challenge) with complete model answers.",
];

const BaseInput = z.object({
  apiKey: z.string().min(10),
  topic: z.string().min(2).max(200),
  className: z.string().default("10th Grade"),
  country: z.string().default("USA"),
  educationBoard: z.string().default("Standard Board"),
});

const PartInput = BaseInput.extend({
  partIndex: z.number().int().min(0).max(3),
  /** The specific items this part must teach (from the chapter map). */
  outline: z.string().max(12000).optional(),
  /** Skip the saved copy and write it again. */
  fresh: z.boolean().optional(),
});

const SYSTEM = `You are AceCoach, a world-class subject teacher AND the textbook itself. The student has no book and no other source — everything they learn must be on this page.

Absolute rules:
- Teach the ACTUAL subject matter of the exact chapter asked. State the real definitions, the real theorems/laws/rules by name, the real formulas, the real proofs, the real facts, dates, names, examples and numbers.
- This applies to EVERY topic in EVERY subject — maths, physics, chemistry, biology, history, geography, economics, civics, computer science, literature, grammar, languages, accounting, anything. No topic gets a generic treatment.
- NEVER give study advice in place of content. Forbidden: "write the definition", "list the key points", "refer to your textbook", "look up", "find the keyword", "identify the formula", "practise examples from your book", "understand the concept of", "students should learn", or any sentence that describes what to learn instead of teaching it. If you catch yourself describing what the student should learn, teach it instead.
- Be specific, never generic. Example: for "Triangles" you would actually state and prove the Basic Proportionality Theorem (Thales) and its converse, state the AAA, AA, SSS and SAS similarity criteria, prove the area ratio theorem, prove Pythagoras and its converse, and solve problems with actual side lengths. For "French Revolution": the actual Estates, the dates (5 May 1789, 14 July 1789…), the people (Louis XVI, Robespierre…), the documents, causes and consequences. For "Photosynthesis": the actual equation, chloroplast structure, light reactions and Calvin cycle step by step. Do the same for whatever topic is asked.
- Write in flowing, warm teacher prose with clear markdown structure: ### headings for every sub-topic, numbered steps, tables where useful, **bold** key terms.
- All mathematics/chemistry in LaTeX: inline $...$ and display $$...$$ on their own lines. Never put formulas in code blocks. Define every symbol in words after each formula.
- Output only the lesson in markdown. No preamble like "Sure" or "Here is".`;

function cacheKey(d: z.infer<typeof BaseInput>): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return [CACHE_VERSION, norm(d.topic), norm(d.className), norm(d.country), norm(d.educationBoard)].join("|");
}

async function readCache(key: string, partIndex: number): Promise<Record<string, unknown> | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("lecture_cache")
      .select("content")
      .eq("cache_key", key)
      .eq("part_index", partIndex)
      .maybeSingle();
    return (data?.content as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
}

async function writeCache(key: string, partIndex: number, content: unknown, model: string, quality: number) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("lecture_cache")
      .select("quality")
      .eq("cache_key", key)
      .eq("part_index", partIndex)
      .maybeSingle();
    // Never replace a better saved lesson with a weaker one.
    if (existing && existing.quality > quality) return;
    await supabaseAdmin.from("lecture_cache").upsert(
      {
        cache_key: key,
        part_index: partIndex,
        content: content as never,
        model,
        quality,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key,part_index" },
    );
  } catch {
    /* saving is a bonus; never block the student */
  }
}

// ---------------------------------------------------------------------------
// Step 1: map the real chapter (grounded with Google Search) so every part
// has a concrete list of actual items to teach — this is what keeps lessons
// specific for ANY topic, not just famous ones.
// ---------------------------------------------------------------------------

function outlinePrompt(d: z.infer<typeof BaseInput>): string {
  return `Student: ${d.className}, ${d.country}, curriculum/board: ${d.educationBoard}.
Chapter/topic: "${d.topic}"

Map the ACTUAL contents of this chapter exactly as it is taught in the prescribed ${d.educationBoard} textbook for ${d.className} (if the board is unclear, use the most standard textbook treatment for that grade). Search for the real syllabus/textbook contents if needed.

List every section and sub-section in textbook order. Under each, write the concrete items themselves — not descriptions of them:
- every term with its one-line real definition,
- every theorem / law / rule / process / event BY NAME, with the formula, equation, date or statement written out,
- key facts, numbers, names, dates, diagrams/figures (described), tables,
- the in-text examples and exercise question types.

Then split everything into four groups, in order:
PART 1 — ${PART_BRIEFS[0]}
PART 2 — ${PART_BRIEFS[1]}
PART 3 — ${PART_BRIEFS[2]}
PART 4 — ${PART_BRIEFS[3]}

Output format — exactly these four markers, each followed by a bullet list, nothing else:
=== PART 1 ===
- ...
=== PART 2 ===
- ...
=== PART 3 ===
- ...
=== PART 4 ===
- ...`;
}

function splitOutline(text: string): string[] | null {
  const parts = text.split(/^\s*=+\s*PART\s*(\d)\s*=+\s*$/im);
  const out = ["", "", "", ""];
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]) - 1;
    if (n >= 0 && n < 4) out[n] = (parts[i + 1] ?? "").trim().slice(0, 10000);
  }
  return out.filter((p) => p.length > 80).length >= 3 ? out : null;
}

export const generateChapterOutline = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => BaseInput.extend({ fresh: z.boolean().optional() }).parse(v))
  .handler(async ({ data }): Promise<{ outline: string[] | null }> => {
    const { geminiText, normalizeKey } = await import("@/lib/gemini.server");
    const apiKey = normalizeKey(data.apiKey);
    const key = cacheKey(data);
    if (!data.fresh) {
      const cached = await readCache(key, -1);
      if (cached && Array.isArray(cached.outline)) return { outline: cached.outline as string[] };
    }
    try {
      const { text, model } = await geminiText({
        apiKey,
        prompt: outlinePrompt(data),
        deep: true,
        search: true,
        temperature: 0.2,
        maxOutputTokens: 16384,
      });
      const outline = splitOutline(text);
      if (outline) await writeCache(key, -1, { outline }, model, outline.join("").length);
      return { outline };
    } catch {
      // The lesson can still be written without the map.
      return { outline: null };
    }
  });

// ---------------------------------------------------------------------------
// Step 2: write each part, check it is real & specific, improve if not, save.
// ---------------------------------------------------------------------------

function buildPrompt(d: z.infer<typeof PartInput>) {
  const title = LECTURE_TITLES[d.partIndex];
  const map = d.outline?.trim()
    ? `\n\nThese are the actual items of the chapter that THIS part must teach. Teach every single one fully — state it, explain it, prove/derive/illustrate it, and give a solved example where it applies. Do not skip any, and add anything else of this part that the book contains:\n${d.outline.trim()}\n`
    : "";
  return `Student: ${d.className}, ${d.country}, curriculum/board: ${d.educationBoard}.
Chapter: "${d.topic}"

Write PART ${d.partIndex + 1} of 4 of a complete lesson on this chapter, titled "${title}".
This part covers: ${PART_BRIEFS[d.partIndex]}${map}
Follow the prescribed ${d.educationBoard} textbook chapter for "${d.topic}" in its own order, and teach every heading, definition, theorem, derivation, figure (described in words), table, in-text example and exercise type that belongs to this part — fully, with the real content. Expand anything the book says briefly.

Length: at least 2500 words of real teaching. Include worked examples with complete step-by-step solutions using actual values, a "### Common mistakes" section and a "### Exam tips" section that are specific to this chapter (name the exact results and traps — no general advice).`;
}

const GENERIC_PATTERNS =
  /(refer to (your|the) (text)?book|look (it )?up|from your textbook|write (a|the|down the) (precise |correct )?definition|list (the|all) (key|main) points|find the keyword|take one example from your textbook|understand the (basic )?concept of|students should (learn|know|understand)|make sure (you|to) (learn|know|understand|revise)|it is important to (learn|understand|know)|key concepts include|consult your teacher|go through (the|your) (book|notes))/gi;

/** 0-100: how much real, specific teaching the text contains. */
function qualityScore(text: string): number {
  const generic = text.match(GENERIC_PATTERNS)?.length ?? 0;
  const headings = text.match(/^#{2,4}\s+/gm)?.length ?? 0;
  const numbers = text.match(/\d+(\.\d+)?/g)?.length ?? 0;
  const math = text.match(/\$[^$]+\$/g)?.length ?? 0;
  const bold = text.match(/\*\*[^*]+\*\*/g)?.length ?? 0;
  let score = Math.min(40, text.length / 300); // 12k chars → 40
  score += Math.min(15, headings * 2);
  score += Math.min(20, (numbers + math) / 4);
  score += Math.min(15, bold / 2);
  score += 10;
  score -= generic * 12;
  return Math.max(0, Math.round(score));
}

const GOOD_ENOUGH = 70;

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
  .inputValidator((v: unknown) => PartInput.parse(v))
  .handler(async ({ data }): Promise<LecturePart> => {
    const { geminiText, normalizeKey, isLiteModel, LESSON_MODELS } = await import("@/lib/gemini.server");
    const apiKey = normalizeKey(data.apiKey);
    const title = LECTURE_TITLES[data.partIndex];
    const key = cacheKey(data);

    // A great lesson already written for this exact chapter is reused instantly —
    // no waiting, and it never costs the student's daily AI limit.
    if (!data.fresh) {
      const cached = await readCache(key, data.partIndex);
      if (cached && typeof cached.writtenTranscriptMarkdown === "string") {
        return cached as unknown as LecturePart;
      }
    }

    const strongModels = LESSON_MODELS.filter((m) => !isLiteModel(m));
    let { text, model } = await geminiText({ apiKey, system: SYSTEM, prompt: buildPrompt(data), deep: true });
    let score = qualityScore(text);

    // Up to two improvement passes: rewrite if generic, extend if thin.
    for (let pass = 0; pass < 2 && score < GOOD_ENOUGH; pass++) {
      const generic = (text.match(GENERIC_PATTERNS)?.length ?? 0) >= 1 || text.length < 4000;
      try {
        const more = generic
          ? await geminiText({
              apiKey,
              system: SYSTEM,
              deep: true,
              models: strongModels,
              prompt: `${buildPrompt(data)}

Your previous draft is below. It is too short and/or gives study instructions or general statements instead of the actual content. Rewrite it completely as the full lesson with the real definitions, named theorems/laws/events, proofs, facts, numbers and fully solved examples for "${data.topic}". Replace every vague sentence with the specific content it refers to.

"""${text}"""`,
            })
          : await geminiText({
              apiKey,
              system: SYSTEM,
              deep: true,
              models: strongModels,
              prompt: `You are continuing part "${title}" of a lesson on "${data.topic}" (${data.className}, ${data.educationBoard}). Here is what is written so far:

"""${text}"""
${data.outline ? `\nItems this part must cover:\n${data.outline}\n` : ""}
Continue with the sub-topics, proofs, facts and fully solved examples of this part that are still missing or only briefly covered. At least 1200 more words of real, specific content. Do not repeat anything above, do not add a preamble.`,
            });
        const candidate = generic ? more.text : `${text.trim()}\n\n${more.text.trim()}`;
        const candScore = qualityScore(candidate);
        if (candScore > score) {
          text = candidate;
          score = candScore;
          model = more.model;
        }
      } catch {
        break; // keep the best draft we have
      }
    }

    if ((text.match(GENERIC_PATTERNS)?.length ?? 0) >= 3 && text.length < 3000) {
      throw new Error("AceCoach is still writing the real content for this part — retrying…");
    }

    const words = plain(text).split(" ").length;
    const part: LecturePart = {
      segmentTitle: title,
      readingTimeMinutes: Math.max(5, Math.round(words / 180)),
      audioSpeakerPrompt: narrationFrom(text, data.topic, data.partIndex),
      writtenTranscriptMarkdown: text.trim(),
      acedCheckpoints: checkpointsFrom(text),
    };
    const light = isLiteModel(model);
    // Only save lessons from strong models that pass the quality bar.
    if (!light && score >= GOOD_ENOUGH) await writeCache(key, data.partIndex, part, model, score);
    return { ...part, lightModel: light };
  });
