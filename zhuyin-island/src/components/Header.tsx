import { Bpmf } from "./BpmfText.tsx";
import { GameButton } from "./GameButton.tsx";
import { SoundToggle } from "./SoundToggle.tsx";
import { ui } from "../data/ui.ts";

export function Header({ title, step, onBack }: { title: string; step?: string; onBack: () => void }) {
  return (
    <header className="mb-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <GameButton tone="white" size="md" onClick={onBack}>
          <Bpmf text={ui.back} />
        </GameButton>
        <SoundToggle />
      </div>
      <div>
        <h1 className="text-[1.8rem]">
          <Bpmf text={title} />
        </h1>
        {step ? (
          <p className="text-[1.35rem] text-[#5c5146]">
            <Bpmf text={step} />
          </p>
        ) : null}
      </div>
    </header>
  );
}

export function Dots({ index, total }: { index: number; total: number }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, dot) => (
        <span
          key={dot}
          className={
            dot < index ? "size-3 rounded-full bg-[#3cbf7a]" : dot === index ? "size-3 rounded-full bg-[#ff8a3d]" : "size-3 rounded-full bg-[#eadfce]"
          }
        />
      ))}
    </div>
  );
}
