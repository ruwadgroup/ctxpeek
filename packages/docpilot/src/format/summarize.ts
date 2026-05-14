/**
 * Local one-paragraph extractive summarizer for a doc file.
 *
 * Strategy (no model calls):
 *   - Split by ## headings into sections.
 *   - For each section, score it by length (proxy for "load-bearing content").
 *   - Take the lead sentence of the top-K sections (default K=3).
 *   - Drop code blocks. Strip markdown link syntax.
 *
 * Output: a 1-3 sentence summary, ≤ 320 chars. Cheap and deterministic.
 * Per design doc §14 Tier A #11.
 */
export type SummaryOptions = {
  readonly maxChars?: number;
  readonly maxSentences?: number;
};

export function summarizeMarkdown(text: string, opts: SummaryOptions = {}): string {
  const maxChars = opts.maxChars ?? 320;
  const maxSentences = opts.maxSentences ?? 3;

  const cleaned = stripCodeBlocks(text);
  const sections = splitSections(cleaned);
  sections.sort((a, b) => b.body.length - a.body.length);

  const sentences: string[] = [];
  for (const sec of sections) {
    if (sentences.length >= maxSentences) break;
    const sentence = leadSentence(sec.body);
    if (sentence) sentences.push(sentence);
  }

  if (sentences.length === 0) {
    const fallback = leadSentence(cleaned);
    if (fallback) return clamp(fallback, maxChars);
    return "";
  }

  return clamp(sentences.join(" "), maxChars);
}

function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ").replace(/~~~[\s\S]*?~~~/g, " ");
}

type Section = {
  readonly heading: string;
  readonly body: string;
};

function splitSections(text: string): Section[] {
  const out: Section[] = [];
  const lines = text.split(/\r?\n/);
  let heading = "";
  let buf: string[] = [];
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      if (buf.length > 0) out.push({ heading, body: buf.join(" ").trim() });
      heading = m[2] ?? "";
      buf = [];
    } else if (line.trim()) {
      buf.push(line.trim());
    }
  }
  if (buf.length > 0) out.push({ heading, body: buf.join(" ").trim() });
  return out;
}

function leadSentence(text: string): string {
  if (!text) return "";
  const stripped = stripMarkdown(text);
  const m = /[^.!?\n]+[.!?]/.exec(stripped);
  return (m?.[0] ?? stripped).trim();
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ");
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
