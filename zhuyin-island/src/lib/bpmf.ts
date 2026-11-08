import { readings } from "../data/readings.ts";

// 題目文字用一般國字書寫。破音字在後面加 {1}、{2}…，
// 數字代表注音粉圓的第幾個讀音（0 是最常見、不用寫）。
// 「一」和「不」會在組句時自動變調，不用自己標。

export type Segment =
  | { kind: "han"; ch: string; alt: number }
  | { kind: "text"; text: string };

const HAN = /(\p{Script=Han})(?:\{(\d+)\})?/gu;
const VARIATION_BASE = 0xe01e0;

export function parseMarkup(input: string): Segment[] {
  const parts: Segment[] = [];
  let cursor = 0;
  for (const match of input.matchAll(HAN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ kind: "text", text: input.slice(cursor, index) });
    }
    const character = match[1] ?? "";
    const alt = match[2] ? Number(match[2]) : 0;
    parts.push({ kind: "han", ch: character, alt });
    cursor = index + match[0].length;
  }
  if (cursor < input.length) {
    parts.push({ kind: "text", text: input.slice(cursor) });
  }
  return parts;
}

export function toneOf(bpmf: string): 1 | 2 | 3 | 4 | 5 {
  if (bpmf.startsWith("˙")) return 5;
  if (bpmf.endsWith("ˊ")) return 2;
  if (bpmf.endsWith("ˇ")) return 3;
  if (bpmf.endsWith("ˋ")) return 4;
  return 1;
}

export function readingOf(character: string, alt: number): string | undefined {
  return readings[character]?.[alt];
}

type HanSegment = { kind: "han"; ch: string; alt: number };

function followingHan(
  parts: Segment[],
  index: number,
): { segment: HanSegment; blocked: boolean } | null {
  let blocked = false;
  for (let cursor = index + 1; cursor < parts.length; cursor += 1) {
    const part = parts[cursor];
    if (!part) continue;
    if (part.kind === "text") {
      // 標點把詞切開，變調不越過句號、引號。
      if (/[^\s]/.test(part.text)) blocked = true;
      continue;
    }
    return { segment: part, blocked };
  }
  return null;
}

export function resolve(input: string): Segment[] {
  const parts = parseMarkup(input);
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || part.kind !== "han") continue;
    if (part.ch !== "一" && part.ch !== "不") continue;
    const next = followingHan(parts, index);
    if (!next || next.blocked) {
      part.alt = 0;
      continue;
    }
    const tone = toneOf(readingOf(next.segment.ch, next.segment.alt) ?? "");
    if (part.ch === "一") {
      // 第四聲前面讀第二聲，第一到第三聲前面讀第四聲。
      part.alt = tone === 4 ? 1 : tone >= 1 && tone <= 3 ? 2 : 0;
    } else {
      // 「不」只在第四聲前面改讀第二聲。
      part.alt = tone === 4 ? 1 : 0;
    }
  }
  return parts;
}

export function toIvs(parts: Segment[]): string {
  return parts
    .map((part) => {
      if (part.kind === "text") return part.text;
      if (part.alt <= 0) return part.ch;
      return part.ch + String.fromCodePoint(VARIATION_BASE + part.alt);
    })
    .join("");
}

export function plain(input: string): string {
  return resolve(input)
    .map((part) => (part.kind === "text" ? part.text : part.ch))
    .join("");
}

export function transcribe(input: string): string {
  return resolve(input)
    .map((part) => {
      if (part.kind === "text") return part.text;
      return `${part.ch}(${readingOf(part.ch, part.alt) ?? "?"})`;
    })
    .join("");
}
