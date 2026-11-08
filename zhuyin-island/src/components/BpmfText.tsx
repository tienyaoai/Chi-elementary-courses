import { readingOf, resolve, toIvs } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { useFontOk } from "../lib/font-state.ts";

export function Bpmf({ text, className }: { text: string; className?: string }) {
  const fontOk = useFontOk();
  const parts = resolve(text);
  if (!fontOk) {
    return (
      <span className={cx("ruby-fallback", className)}>
        {parts.map((part, index) =>
          part.kind === "text" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <ruby key={index}>
              {part.ch}
              <rt>{readingOf(part.ch, part.alt) ?? ""}</rt>
            </ruby>
          ),
        )}
      </span>
    );
  }
  return <span className={cx("bpmf", className)}>{toIvs(parts)}</span>;
}
