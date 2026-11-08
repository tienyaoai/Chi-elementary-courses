import { useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { Header } from "../components/Header.tsx";
import { SpeakButton } from "../components/SpeakButton.tsx";
import { themes } from "../data/content.ts";
import type { LessonCard } from "../data/content.ts";
import { stampCount, ui } from "../data/ui.ts";
import { plain } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { useProgress } from "../lib/progress.ts";
import { speak } from "../lib/speech.ts";

export function CardsScreen({ onExit }: { onExit: () => void }) {
  const { progress, update } = useProgress();
  const [themeId, setThemeId] = useState(themes[0]?.id ?? "");
  const [activeId, setActiveId] = useState<string | null>(null);
  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  if (!theme) return null;
  const active = theme.cards.find((card) => card.id === activeId) ?? null;
  const done = theme.cards.filter((card) => progress.stamps.includes(card.id)).length;

  function tap(card: LessonCard) {
    setActiveId(card.id);
    update((current) =>
      current.stamps.includes(card.id) ? current : { ...current, stamps: [...current.stamps, card.id] },
    );
    void speak(plain(`${card.word}。${card.sentence}`));
  }

  return (
    <div>
      <Header title={ui.cardsTitle} step={stampCount(done, theme.cards.length)} onBack={onExit} />
      <div className="mb-4 flex flex-wrap gap-2">
        {themes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cx(
              "shrink-0 rounded-full px-4 py-2 text-[1.3rem] shadow-[0_4px_0_#e4d2b4]",
              item.id === theme.id ? "bg-[#ffd15a]" : "bg-white",
            )}
            onClick={() => {
              setThemeId(item.id);
              setActiveId(null);
            }}
          >
            <Bpmf text={item.title} />
          </button>
        ))}
      </div>
      {done === theme.cards.length ? (
        <p className="mb-3 text-[1.35rem]">
          <Bpmf text={ui.themeDone} />
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {theme.cards.map((card) => {
          const stamped = progress.stamps.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              data-testid="lesson-card"
              className={cx(
                "relative rounded-[24px] bg-white px-2 py-3 text-center shadow-[0_6px_0_#e4d2b4] active:translate-y-1 active:shadow-none",
                activeId === card.id && "outline-4 outline-[#ff8a3d]",
              )}
              onClick={() => tap(card)}
            >
              <span className="emoji block text-5xl" aria-hidden="true">
                {card.emoji}
              </span>
              <span className="mt-1 block text-[1.45rem]">
                <Bpmf text={card.word} />
              </span>
              {stamped ? (
                <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-[#ffd15a] text-sm" aria-hidden="true">
                  ★
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {active ? (
        <div className="mt-4 rounded-[24px] bg-white p-4 shadow-[0_6px_0_#e4d2b4]">
          <p className="text-[1.25rem] text-[#5c5146]">
            <Bpmf text={ui.sentenceLabel} />
          </p>
          <p className="mt-1 text-[1.55rem]">
            <Bpmf text={active.sentence} />
          </p>
          <div className="mt-3">
            <SpeakButton text={`${active.word}。${active.sentence}`} label={ui.listen} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
