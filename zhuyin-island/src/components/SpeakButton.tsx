import { useState } from "react";
import { Bpmf } from "./BpmfText.tsx";
import { GameButton } from "./GameButton.tsx";
import { plain } from "../lib/bpmf.ts";
import { speak } from "../lib/speech.ts";
import { ui } from "../data/ui.ts";

export function SpeakButton({ text, label }: { text: string; label: string }) {
  const [hint, setHint] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <GameButton
        tone="white"
        onClick={() => {
          void speak(plain(text)).then((result) => {
            if (result === "missing") setHint(true);
          });
        }}
      >
        <span className="emoji" aria-hidden="true">
          🔊
        </span>
        <Bpmf text={label} />
      </GameButton>
      {hint ? (
        <p className="text-[1.3rem]">
          <Bpmf text={ui.noVoice} />
        </p>
      ) : null}
    </div>
  );
}
