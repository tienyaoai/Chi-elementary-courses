import { useRef, useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { Dots, Header } from "../components/Header.tsx";
import { GameButton } from "../components/GameButton.tsx";
import { SpeakButton } from "../components/SpeakButton.tsx";
import { stories } from "../data/content.ts";
import type { StoryItem } from "../data/content.ts";
import { askStep, quizDetail, storyStep, ui } from "../data/ui.ts";
import { playCorrect, playWrong } from "../lib/audio.ts";
import { plain } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { sample } from "../lib/random.ts";
import { starsFor } from "../lib/score.ts";
import { speak } from "../lib/speech.ts";

type Phase = { kind: "read" } | { kind: "ask"; question: number };

export function StoryScreen({
  onExit,
  onDone,
}: {
  onExit: () => void;
  onDone: (result: { stars: number; detail: string }) => void;
}) {
  const [round] = useState<StoryItem[]>(() => sample(stories, 2));
  const [storyIndex, setStoryIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "read" });
  const [wrong, setWrong] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const firstRef = useRef(0);
  const story = round[storyIndex];
  const questionTotal = round.reduce((sum, item) => sum + item.questions.length, 0);

  function resetAnswer() {
    setWrong([]);
    setPicked(null);
    setFeedback("");
  }

  function advance(clean: boolean) {
    if (!story) return;
    if (phase.kind === "ask" && clean) firstRef.current += 1;
    if (phase.kind === "ask" && phase.question + 1 < story.questions.length) {
      setPhase({ kind: "ask", question: phase.question + 1 });
      resetAnswer();
      return;
    }
    if (storyIndex + 1 < round.length) {
      setStoryIndex(storyIndex + 1);
      setPhase({ kind: "read" });
      resetAnswer();
      return;
    }
    const got = firstRef.current;
    onDone({ stars: starsFor(got, questionTotal), detail: quizDetail(got, questionTotal) });
  }

  function choose(option: string, answer: string) {
    if (picked) return;
    void speak(plain(option));
    if (option === answer) {
      setPicked(option);
      setFeedback(ui.correct);
      playCorrect();
      return;
    }
    const nextWrong = [...wrong, option];
    setWrong(nextWrong);
    playWrong();
    if (nextWrong.length >= 2) {
      setPicked(answer);
      setFeedback(ui.showAnswer);
    } else {
      setFeedback(ui.tryAgain);
    }
  }

  if (!story) return null;
  const question = phase.kind === "ask" ? story.questions[phase.question] : null;
  const storyText = story.lines.join("");
  const answeredClean = question ? picked === question.answer && wrong.length === 0 : false;
  const atEnd =
    phase.kind === "ask" && storyIndex + 1 >= round.length && phase.question + 1 >= story.questions.length;

  return (
    <div>
      <Header
        title={story.title}
        step={phase.kind === "read" ? storyStep(storyIndex + 1, round.length) : askStep((phase.question ?? 0) + 1, story.questions.length)}
        onBack={onExit}
      />
      <Dots index={storyIndex} total={round.length} />
      <div className="rounded-[28px] bg-white p-4 shadow-[0_8px_0_#e4d2b4]">
        <div className="emoji mb-2 text-5xl" aria-hidden="true">
          {story.emoji}
        </div>
        {story.lines.map((line) => (
          <p key={line} className="text-[1.5rem]">
            <Bpmf text={line} />
          </p>
        ))}
        <div className="mt-3">
          <SpeakButton text={storyText} label={ui.listenStory} />
        </div>
      </div>

      {phase.kind === "read" ? (
        <div className="mt-4">
          <p className="mb-3 text-[1.35rem]">
            <Bpmf text={ui.readFirst} />
          </p>
          <GameButton data-testid="story-ready" tone="sun" onClick={() => setPhase({ kind: "ask", question: 0 })}>
            <Bpmf text={ui.readDone} />
          </GameButton>
        </div>
      ) : null}

      {question ? (
        <div className="mt-4">
          <p className="text-[1.55rem]">
            <Bpmf text={question.ask} />
          </p>
          <div className="mt-3 flex flex-col gap-3">
            {question.options.map((option) => {
              const missed = wrong.includes(option);
              const show = picked !== null && option === question.answer;
              return (
                <button
                  key={option}
                  type="button"
                  data-testid="story-option"
                  disabled={picked !== null || missed}
                  className={cx(
                    "rounded-[24px] bg-white px-3 py-3 text-left text-[1.45rem] shadow-[0_6px_0_#e4d2b4]",
                    missed && "bg-[#ffe4e6] opacity-70",
                    show && "bg-[#e7f8ee] outline-4 outline-[#24945a]",
                  )}
                  onClick={() => choose(option, question.answer)}
                >
                  <Bpmf text={option} />
                </button>
              );
            })}
          </div>
          {feedback ? (
            <p className="mt-3 text-[1.4rem]" aria-live="polite">
              <Bpmf text={feedback} />
            </p>
          ) : null}
          {picked ? (
            <div className="mt-3">
              <GameButton data-testid="story-next" tone="sun" onClick={() => advance(answeredClean)}>
                <Bpmf text={atEnd ? ui.seeStars : ui.nextQuestion} />
              </GameButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
