import { useRef, useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { Dots, Header } from "../components/Header.tsx";
import { GameButton } from "../components/GameButton.tsx";
import { SpeakButton } from "../components/SpeakButton.tsx";
import { orderItems } from "../data/content.ts";
import { askStep, quizDetail, ui } from "../data/ui.ts";
import { playCorrect, playWrong } from "../lib/audio.ts";
import { plain } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { sample, shuffle } from "../lib/random.ts";
import { starsFor } from "../lib/score.ts";
import { speak } from "../lib/speech.ts";

type Chip = { id: string; text: string };

type Round = { emoji: string; chips: Chip[]; answer: string };

function makeRound(): Round[] {
  return sample(orderItems, 5).map((item) => {
    const chips = shuffle(item.chunks.map((text, index) => ({ id: `${item.id}-${index}`, text })));
    return { emoji: item.emoji, chips, answer: item.chunks.join("") };
  });
}

export function OrderScreen({
  onExit,
  onDone,
}: {
  onExit: () => void;
  onDone: (result: { stars: number; detail: string }) => void;
}) {
  const [round] = useState(makeRound);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Chip[]>([]);
  const [fails, setFails] = useState(0);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [confetti, setConfetti] = useState(false);
  const firstRef = useRef(0);
  const item = round[index];

  function goNext(clean: boolean) {
    if (clean) firstRef.current += 1;
    const next = index + 1;
    if (next >= round.length) {
      const got = firstRef.current;
      onDone({ stars: starsFor(got, round.length), detail: quizDetail(got, round.length) });
      return;
    }
    setIndex(next);
    setChosen([]);
    setFails(0);
    setSolved(false);
    setRevealed(false);
    setFeedback("");
    setConfetti(false);
  }

  function add(chip: Chip) {
    if (solved || revealed || chosen.some((itemChip) => itemChip.id === chip.id)) return;
    void speak(plain(chip.text));
    setChosen((current) => [...current, chip]);
    setFeedback("");
  }

  function remove(id: string) {
    if (solved || revealed) return;
    setChosen((current) => current.filter((chip) => chip.id !== id));
  }

  function check() {
    if (!item || solved || revealed) return;
    if (chosen.length !== item.chips.length) {
      setFeedback(ui.orderLeft);
      return;
    }
    const attempt = chosen.map((chip) => chip.text).join("");
    if (attempt === item.answer) {
      setSolved(true);
      setFeedback(ui.correct);
      setConfetti(true);
      playCorrect();
      return;
    }
    const nextFails = fails + 1;
    setFails(nextFails);
    setFeedback(ui.orderWrong);
    playWrong();
  }

  function reveal() {
    if (!item) return;
    setChosen(item.chips);
    setRevealed(true);
    setFeedback(ui.showAnswer);
  }

  if (!item) return null;
  const waiting = item.chips.filter((chip) => !chosen.some((picked) => picked.id === chip.id));
  const sentence = `${item.answer}。`;

  return (
    <div>
      <Confetti show={confetti} />
      <Header title={ui.orderTitle} step={askStep(index + 1, round.length)} onBack={onExit} />
      <Dots index={index} total={round.length} />
      <div className="emoji mx-auto grid size-28 place-items-center rounded-full bg-white text-6xl shadow-[0_8px_0_#e4d2b4]">
        {item.emoji}
      </div>
      <div className="mt-4 min-h-28 rounded-[24px] bg-white/85 p-3">
        {chosen.length === 0 ? (
          <p className="text-[1.35rem] text-[#5c5146]">
            <Bpmf text={ui.orderEmpty} />
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {chosen.map((chip) => (
              <ChipButton key={chip.id} text={chip.text} onClick={() => remove(chip.id)} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {waiting.map((chip) => (
          <ChipButton key={chip.id} text={chip.text} onClick={() => add(chip)} testId="order-chip" />
        ))}
      </div>
      {feedback ? (
        <p className="mt-4 text-center text-[1.4rem]" aria-live="polite">
          <Bpmf text={feedback} />
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        {!solved && !revealed ? (
          <>
            <GameButton data-testid="order-check" tone="leaf" onClick={check}>
              <Bpmf text={ui.check} />
            </GameButton>
            <div className="flex flex-wrap gap-3">
              <GameButton
                tone="white"
                onClick={() => {
                  setChosen([]);
                  setFeedback("");
                }}
              >
                <Bpmf text={ui.resetOrder} />
              </GameButton>
              {fails >= 2 ? (
                <GameButton tone="sea" onClick={reveal}>
                  <Bpmf text={ui.reveal} />
                </GameButton>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-[1.6rem]">
              <Bpmf text={sentence} />
            </p>
            <SpeakButton text={sentence} label={ui.listen} />
            <GameButton data-testid="order-next" tone="sun" onClick={() => goNext(solved && fails === 0)}>
              <Bpmf text={index + 1 >= round.length ? ui.seeStars : ui.nextSentence} />
            </GameButton>
          </>
        )}
      </div>
    </div>
  );
}

function ChipButton({ text, onClick, testId }: { text: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      className={cx(
        "rounded-full bg-[#fff7df] px-4 py-2 text-[1.45rem] shadow-[0_4px_0_#e0a82a] active:translate-y-0.5 active:shadow-none",
      )}
      onClick={onClick}
    >
      <Bpmf text={text} />
    </button>
  );
}
