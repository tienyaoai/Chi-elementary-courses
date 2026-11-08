import { useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { GameButton } from "../components/GameButton.tsx";
import { Mascot } from "../components/Mascot.tsx";
import { SoundToggle } from "../components/SoundToggle.tsx";
import { Stars } from "../components/Stars.tsx";
import { cardTotal } from "../data/content.ts";
import { collectedLine, stampCount, ui } from "../data/ui.ts";
import { useFontOk } from "../lib/font-state.ts";
import { defaultProgress, useProgress } from "../lib/progress.ts";
import { modes } from "../lib/screen.ts";
import type { Mode } from "../lib/screen.ts";

const games: readonly { mode: Mode; emoji: string; color: string; title: string; blurb: string }[] = [
  { mode: "quiz", emoji: "🖼️", color: "#ffe1c7", title: ui.quizTitle, blurb: ui.quizBlurb },
  { mode: "order", emoji: "✨", color: "#d7f0ff", title: ui.orderTitle, blurb: ui.orderBlurb },
  { mode: "memory", emoji: "🃏", color: "#ffe0ea", title: ui.memoryTitle, blurb: ui.memoryBlurb },
  { mode: "story", emoji: "📖", color: "#ddf6e6", title: ui.storyTitle, blurb: ui.storyBlurb },
];

const cardClass =
  "flex w-full items-center gap-3 rounded-[28px] bg-white p-4 text-left shadow-[0_8px_0_#e4d2b4] transition active:translate-y-1 active:shadow-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#2c241c]";

export function HomeScreen({ onPlay, onCards }: { onPlay: (mode: Mode) => void; onCards: () => void }) {
  const { progress, update } = useProgress();
  const fontOk = useFontOk();
  const [cleared, setCleared] = useState(false);
  const starSum = modes.reduce((sum, mode) => sum + (progress.best[mode] ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <SoundToggle />
      </div>
      <div className="text-center">
        <Mascot className="mx-auto" />
        <h1 className="text-[1.45rem] min-[380px]:text-[1.7rem] sm:text-[2.15rem]">
          <Bpmf text={ui.title} />
        </h1>
        <p className="text-[1.35rem]">
          <Bpmf text={ui.subtitle} />
        </p>
        <p className="mt-2 text-[1.3rem]">
          <Bpmf text={collectedLine(starSum)} />
        </p>
      </div>

      {!fontOk ? (
        <p className="rounded-[28px] bg-white/90 p-4 text-[1.35rem]">
          <Bpmf text={ui.fontMissing} />
        </p>
      ) : null}

      {!progress.introSeen ? (
        <section className="rounded-[28px] bg-white p-4 shadow-[0_8px_0_#e4d2b4]">
          <p className="text-[1.45rem]">
            <Bpmf text={ui.intro1} />
          </p>
          <p className="mt-2 text-[1.45rem]">
            <Bpmf text={ui.intro2} />
          </p>
          <p className="mt-2 text-[1.45rem]">
            <Bpmf text={ui.intro3} />
          </p>
          <div className="mt-4">
            <GameButton className="w-full" tone="sun" onClick={() => update((current) => ({ ...current, introSeen: true }))}>
              <Bpmf text={ui.gotIt} />
            </GameButton>
          </div>
        </section>
      ) : null}

      <button type="button" data-testid="game-cards" className={cardClass} onClick={onCards}>
        <Tile emoji="🏠" color="#fff3c4" />
        <span className="min-w-0 flex-1">
          <span className="block text-[1.7rem]">
            <Bpmf text={ui.cardsTitle} />
          </span>
          <span className="mt-1 block text-[1.3rem] text-[#5c5146]">
            <Bpmf text={ui.cardsBlurb} />
          </span>
          <span className="mt-1 block text-[1.25rem]">
            <Bpmf text={stampCount(progress.stamps.length, cardTotal)} />
          </span>
        </span>
      </button>

      {games.map((game) => (
        <button
          key={game.mode}
          type="button"
          data-testid={`game-${game.mode}`}
          className={cardClass}
          onClick={() => onPlay(game.mode)}
        >
          <Tile emoji={game.emoji} color={game.color} />
          <span className="min-w-0 flex-1">
            <span className="block text-[1.7rem]">
              <Bpmf text={game.title} />
            </span>
            <span className="mt-1 block text-[1.3rem] text-[#5c5146]">
              <Bpmf text={game.blurb} />
            </span>
            <span className="mt-2 block">
              <Stars value={progress.best[game.mode] ?? 0} />
            </span>
          </span>
        </button>
      ))}

      <details className="rounded-[28px] bg-white/90 p-4 shadow-[0_8px_0_#e4d2b4]">
        <summary className="cursor-pointer text-[1.45rem]">
          <Bpmf text={ui.adultTitle} />
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-[1.3rem]">
          <p>
            <Bpmf text={ui.adult1} />
          </p>
          <p>
            <Bpmf text={ui.adult2} />
          </p>
          <p>
            <Bpmf text={ui.adult3} />
          </p>
          <p>
            <Bpmf text={ui.adult4} />
          </p>
          <p>
            <Bpmf text={ui.adult5} />
          </p>
          <p>
            <Bpmf text={ui.adult6} />
          </p>
          <a
            className="text-[#13598a] underline"
            href="https://github.com/ButTaiwan/bpmfvs"
            target="_blank"
            rel="noreferrer"
          >
            <Bpmf text={ui.fontLink} />
          </a>
          <GameButton
            tone="white"
            onClick={() => {
              update(() => defaultProgress());
              setCleared(true);
            }}
          >
            <Bpmf text={ui.clear} />
          </GameButton>
          {cleared ? (
            <p>
              <Bpmf text={ui.cleared} />
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function Tile({ emoji, color }: { emoji: string; color: string }) {
  return (
    <span
      className="emoji grid size-16 shrink-0 place-items-center rounded-2xl text-4xl"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  );
}
