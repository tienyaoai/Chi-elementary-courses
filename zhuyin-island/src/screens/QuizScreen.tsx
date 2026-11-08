import { useRef, useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { Confetti } from "../components/Confetti.tsx";
import { Dots, Header } from "../components/Header.tsx";
import { Picture } from "../components/Picture.tsx";
import { SpeakButton } from "../components/SpeakButton.tsx";
import { quizItems } from "../data/content.ts";
import type { QuizItem } from "../data/content.ts";
import { askStep, quizDetail, ui } from "../data/ui.ts";
import { playCorrect, playWrong } from "../lib/audio.ts";
import { plain } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { sample, shuffle } from "../lib/random.ts";
import { starsFor } from "../lib/score.ts";
import { speak } from "../lib/speech.ts";
import { useLater } from "../lib/use-later.ts";

type RoundItem = QuizItem & { order: readonly string[] };

export function QuizScreen({
  onExit,
  onDone,
}: {
  onExit: () => void;
  onDone: (result: { stars: number; detail: string }) => void;
}) {
  const [round] = useState<RoundItem[]>(() =>
    sample(quizItems, 8).map((item) => ({ ...item, order: shuffle(item.options) })),
  );
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [lock, setLock] = useState(false);
  const [phase, setPhase] = useState<"play" | "ok" | "show">("play");
  const [feedback, setFeedback] = useState("");
  const [confetti, setConfetti] = useState(false);
  const later = useLater();
  const indexRef = useRef(0);
  const wrongRef = useRef<string[]>([]);
  const lockRef = useRef(false);
  const firstRef = useRef(0);
  const item = round[index];

  function finish(clean: boolean) {
    if (clean) firstRef.current += 1;
    const next = indexRef.current + 1;
    if (next >= round.length) {
      const got = firstRef.current;
      onDone({ stars: starsFor(got, round.length), detail: quizDetail(got, round.length) });
      return;
    }
    indexRef.current = next;
    wrongRef.current = [];
    lockRef.current = false;
    setIndex(next);
    setWrong([]);
    setLock(false);
    setPhase("play");
    setFeedback("");
    setConfetti(false);
  }

  function choose(option: string) {
    if (!item || lockRef.current || wrongRef.current.includes(option)) return;
    void speak(plain(option));
    if (option === item.answer) {
      const clean = wrongRef.current.length === 0;
      lockRef.current = true;
      setLock(true);
      setPhase("ok");
      setFeedback(ui.correct);
      setConfetti(true);
      playCorrect();
      later(() => finish(clean), 900);
      return;
    }
    const nextWrong = [...wrongRef.current, option];
    wrongRef.current = nextWrong;
    setWrong(nextWrong);
    playWrong();
    if (nextWrong.length >= 2) {
      lockRef.current = true;
      setLock(true);
      setPhase("show");
      setFeedback(ui.showAnswer);
      later(() => finish(false), 1300);
    } else {
      setFeedback(ui.tryAgain);
    }
  }

  if (!item) return null;
  const wide = item.options.some((option) => plain(option).length > 2);

  return (
    <div>
      <Confetti show={confetti} />
      <Header title={ui.quizTitle} step={askStep(index + 1, round.length)} onBack={onExit} />
      <Dots index={index} total={round.length} />
      <Picture picture={item.picture} />
      <p className="mt-4 text-center text-[1.7rem]">
        <Bpmf text={item.ask} />
      </p>
      <div className={cx("mt-4 grid gap-3", wide ? "grid-cols-1" : "grid-cols-2")}>
        {item.order.map((option) => {
          const isAnswer = option === item.answer;
          const missed = wrong.includes(option);
          const show = (phase === "ok" || phase === "show") && isAnswer;
          return (
            <button
              key={option}
              type="button"
              data-testid="quiz-option"
              disabled={lock || missed}
              className={cx(
                "rounded-[24px] bg-white px-3 py-3 text-[1.55rem] shadow-[0_6px_0_#e4d2b4] active:translate-y-1 active:shadow-none disabled:active:translate-y-0",
                missed && "bg-[#ffe4e6] opacity-70",
                show && "bg-[#e7f8ee] outline-4 outline-[#24945a]",
              )}
              onClick={() => choose(option)}
            >
              <Bpmf text={option} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col items-center gap-3">
        {feedback ? (
          <p className="text-center text-[1.45rem]" aria-live="polite">
            <Bpmf text={feedback} />
          </p>
        ) : null}
        <SpeakButton text={item.ask} label={ui.listen} />
      </div>
    </div>
  );
}
