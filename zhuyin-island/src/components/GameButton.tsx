import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx.ts";

const tones = {
  sun: "bg-[#ffd15a] text-[#2c241c] shadow-[0_6px_0_#e0a82a]",
  white: "bg-white text-[#2c241c] shadow-[0_6px_0_#e4d2b4]",
  leaf: "bg-[#e7f8ee] text-[#1d6b40] shadow-[0_6px_0_#8ed5ad]",
  sea: "bg-[#e5f4ff] text-[#13598a] shadow-[0_6px_0_#9fd0f3]",
} as const;

export function GameButton({
  tone = "sun",
  size = "lg",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof tones;
  size?: "md" | "lg";
}) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full text-center whitespace-normal transition active:translate-y-1 active:shadow-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#2c241c]",
        size === "lg" ? "min-h-16 px-5 text-[1.5rem]" : "min-h-14 px-4 text-[1.3rem]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
