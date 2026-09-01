import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/**
 * Cleans up the raw-looking LaTeX/code artefacts models sometimes emit so that
 * formulas read like a human-written textbook instead of computer syntax.
 */
export function humanizeMath(input: string): string {
  let text = input ?? "";

  // Unwrap math that was fenced as code blocks (```latex ... ```)
  text = text.replace(/```(?:latex|math|tex)\s*([\s\S]*?)```/gi, (_m, body: string) => `\n$$\n${body.trim()}\n$$\n`);

  // Normalise delimiters to $ / $$ which remark-math understands.
  text = text
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, b: string) => `\n$$\n${b.trim()}\n$$\n`)
    .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, b: string) => `$${b.trim()}$`)
    .replace(/\\begin\{(equation\*?|align\*?|gather\*?)\}([\s\S]*?)\\end\{\1\}/g, (_m, _e, b: string) => `\n$$\n${b.trim()}\n$$\n`);

  // Stray escaped characters that leak through as literal text.
  text = text.replace(/\\%/g, "%").replace(/\\&/g, "&").replace(/\\_/g, "_");

  // A lone $ with no closing partner would render as a literal dollar sign; keep it.
  return text;
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className ?? "prose-ace"}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: "html" }]]}
      >
        {humanizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}
