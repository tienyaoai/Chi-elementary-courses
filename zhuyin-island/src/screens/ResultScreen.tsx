import { useEffect, useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { GameButton } from "../components/GameButton.tsx";
import { Mascot } from "../components/Mascot.tsx";
import { starCount, ui } from "../data/ui.ts";
import { playWin } from "../lib/audio.ts";
import { loadProgress, useProgress } from "../lib/progress.ts";
import { modes } from "../lib/screen.ts";
import type { Mode } from "../lib/screen.ts";

const titles: Record<Mode, string> = {
  quiz: ui.quizTitle,
  order: ui.orderTitle,
  memory: ui.memoryTitle,
  story: ui.storyTitle,
};

export function ResultScreen({
  mode,
  stars,
  detail,
  onReplay,
  onNext,
  onHome,
}: {
  mode: Mode;
  stars: number;
  detail: string;
  onReplay: () => void;
  onNext: (mode: Mode) => void;
  onHome: () => void;
}) {
  const { update } = useProgress();
  const [fresh] = useState(() => stars > (loadProgress().best[mode] ?? 0));
  const message = stars >= 3 ? ui.result3 : stars === 2 ? ui.result2 : ui.result1;
  const next = modes[(modes.indexOf(mode) + 1) % modes.length] ?? "quiz";

  useEffect(() => {
    playWin();
    update((current) => ({
      ...current,
      best: { ...current.best, [mode]: Math.max(current.best[mode] ?? 0, stars) },
    }));
  }, [mode, stars, update]);

  return (
    <div className="flex flex-col items-center gap-4 pt-4 text-center">
      <Mascot mood={stars >= 2 ? "cheer" : "happy"} />
      <h1 className="text-[1.8rem]">
        <Bpmf text={titles[mode]} />
      </h1>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <span key={index} className="star-pop" style={{ animationDelay: `${index * 0.12}s` }}>
            <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2.6 14.7 8.8 21.4 9.5 16.4 14.1 17.8 20.7 12 17.3 6.2 20.7 7.6 14.1 2.6 9.5 9.3 8.8Z"
                fill={index < stars ? "#f0b429" : "#eadfce"}
                stroke={index < stars ? "#d49612" : "#d9cbb8"}
              />
            </svg>
          </span>
        ))}
      </div>
      <p className="sr-only">{starCount(stars)}</p>
      <p className="text-[1.5rem]">
        <Bpmf text={message} />
      </p>
      <p className="text-[1.35rem]">
        <Bpmf text={detail} />
      </p>
      {fresh ? (
        <p className="text-[1.35rem]">
          <Bpmf text={ui.newBest} />
        </p>
      ) : null}
      <div className="mt-2 flex w-full flex-col gap-3">
        <GameButton data-testid="result-replay" tone="sun" onClick={onReplay}>
          <Bpmf text={ui.again} />
        </GameButton>
        <GameButton data-testid="result-next" tone="sea" onClick={() => onNext(next)}>
          <span className="flex flex-col">
            <Bpmf text={ui.next} />
            <Bpmf text={titles[next]} className="text-[1.2rem]" />
          </span>
        </GameButton>
        <GameButton data-testid="result-home" tone="white" onClick={onHome}>
          <Bpmf text={ui.back} />
        </GameButton>
      </div>
    </div>
  );
}
