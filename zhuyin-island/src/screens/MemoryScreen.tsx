import { useRef, useState } from "react";
import { Bpmf } from "../components/BpmfText.tsx";
import { Header } from "../components/Header.tsx";
import { decks } from "../data/content.ts";
import type { MemoryDeck } from "../data/content.ts";
import { memoryDetail, ui } from "../data/ui.ts";
import { playMatch, playWrong } from "../lib/audio.ts";
import { plain } from "../lib/bpmf.ts";
import { cx } from "../lib/cx.ts";
import { shuffle } from "../lib/random.ts";
import { memoryStars } from "../lib/score.ts";
import { useLater } from "../lib/use-later.ts";

type Face = {
  uid: string;
  pairId: string;
  kind: "word" | "emoji";
  word: string;
  emoji: string;
};

function deal(deck: MemoryDeck): Face[] {
  const faces: Face[] = deck.pairs.flatMap((pair) => [
    { uid: `${pair.id}-word`, pairId: pair.id, kind: "word" as const, word: pair.word, emoji: pair.emoji },
    { uid: `${pair.id}-emoji`, pairId: pair.id, kind: "emoji" as const, word: pair.word, emoji: pair.emoji },
  ]);
  return shuffle(faces);
}

export function MemoryScreen({
  onExit,
  onDone,
}: {
  onExit: () => void;
  onDone: (result: { stars: number; detail: string }) => void;
}) {
  const [deck, setDeck] = useState<MemoryDeck | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [feedback, setFeedback] = useState("");
  const later = useLater();
  const lockRef = useRef(false);
  const doneRef = useRef(false);
  const openRef = useRef<string[]>([]);

  function start(next: MemoryDeck) {
    setDeck(next);
    setFaces(deal(next));
    setOpen([]);
    setMatched([]);
    setMoves(0);
    setFeedback("");
    openRef.current = [];
    lockRef.current = false;
    doneRef.current = false;
  }

  function flip(face: Face) {
    if (!deck || lockRef.current || openRef.current.includes(face.uid) || matched.includes(face.pairId)) return;
    const nextOpen = [...openRef.current, face.uid];
    openRef.current = nextOpen;
    setOpen(nextOpen);
    if (nextOpen.length < 2) return;
    const [firstId, secondId] = nextOpen;
    const first = faces.find((item) => item.uid === firstId);
    const second = faces.find((item) => item.uid === secondId);
    if (!first || !second) return;
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    lockRef.current = true;
    if (first.pairId === second.pairId) {
      const nextMatched = [...matched, first.pairId];
      setFeedback(ui.matchOk);
      playMatch();
      later(() => {
        setMatched(nextMatched);
        openRef.current = [];
        setOpen([]);
        lockRef.current = false;
        if (nextMatched.length === deck.pairs.length && !doneRef.current) {
          doneRef.current = true;
          onDone({
            stars: memoryStars(nextMoves, deck.pairs.length),
            detail: memoryDetail(nextMoves),
          });
        }
      }, 450);
      return;
    }
    setFeedback(ui.matchNo);
    playWrong();
    later(() => {
      openRef.current = [];
      setOpen([]);
      lockRef.current = false;
    }, 900);
  }

  if (!deck) {
    return (
      <div>
        <Header title={ui.memoryTitle} step={ui.memoryPick} onBack={onExit} />
        <div className="flex flex-col gap-3">
          {decks.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid="memory-deck"
              className="flex items-center gap-3 rounded-[28px] bg-white p-4 text-left shadow-[0_8px_0_#e4d2b4] active:translate-y-1 active:shadow-none"
              onClick={() => start(item)}
            >
              <span className="emoji text-4xl" aria-hidden="true">
                {item.pairs[0]?.emoji}
              </span>
              <span>
                <span className="block text-[1.6rem]">
                  <Bpmf text={item.title} />
                </span>
                <span className="block text-[1.25rem] text-[#5c5146]">
                  <Bpmf text={ui.memoryHint} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title={deck.title} step={ui.memoryHint} onBack={() => setDeck(null)} />
      {feedback ? (
        <p className="mb-3 text-center text-[1.35rem]" aria-live="polite">
          <Bpmf text={feedback} />
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {faces.map((face) => {
          const up = open.includes(face.uid) || matched.includes(face.pairId);
          const label = up ? (face.kind === "word" ? plain(face.word) : plain(ui.picture)) : plain(ui.covered);
          return (
            <button
              key={face.uid}
              type="button"
              data-testid="memory-card"
              data-pair={face.pairId}
              className="flip-scene h-32"
              aria-label={label}
              onClick={() => flip(face)}
            >
              <span className={cx("flip-card relative block h-full", up && "is-up")}>
                <span className="flip-face grid place-items-center rounded-[22px] bg-[#ffd15a] text-4xl shadow-[0_6px_0_#e0a82a]">
                  ★
                </span>
                <span className="flip-face flip-back grid place-items-center rounded-[22px] bg-white px-1 text-[1.45rem] shadow-[0_6px_0_#e4d2b4]">
                  {face.kind === "emoji" ? (
                    <span className="emoji text-6xl">{face.emoji}</span>
                  ) : (
                    <Bpmf text={face.word} />
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
