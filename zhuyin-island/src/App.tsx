import { useEffect, useState } from "react";
import { Mascot } from "./components/Mascot.tsx";
import { CardsScreen } from "./screens/CardsScreen.tsx";
import { HomeScreen } from "./screens/HomeScreen.tsx";
import { MemoryScreen } from "./screens/MemoryScreen.tsx";
import { OrderScreen } from "./screens/OrderScreen.tsx";
import { QuizScreen } from "./screens/QuizScreen.tsx";
import { ResultScreen } from "./screens/ResultScreen.tsx";
import { StoryScreen } from "./screens/StoryScreen.tsx";
import { ui } from "./data/ui.ts";
import { FontProvider } from "./lib/font.tsx";
import type { Mode, Screen } from "./lib/screen.ts";

function Splash() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 text-center">
      <Mascot />
      <p className="system-font text-2xl">{ui.loading}</p>
    </div>
  );
}

export default function App() {
  const [fontOk, setFontOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });

  useEffect(() => {
    let live = true;
    const mark = () => {
      if (!live) return;
      if (document.fonts.check('16px "BpmfHuninn"')) {
        setFontOk(true);
        setReady(true);
      }
    };
    const timer = window.setTimeout(() => {
      if (live) setReady(true);
    }, 5000);
    document.fonts.addEventListener("loadingdone", mark);
    document.fonts
      .load('16px "BpmfHuninn"')
      .then(mark)
      .catch(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
      window.clearTimeout(timer);
      document.fonts.removeEventListener("loadingdone", mark);
    };
  }, []);

  function play(mode: Mode) {
    setScreen({ kind: "play", mode, nonce: Date.now() });
  }

  let view = <HomeScreen onPlay={play} onCards={() => setScreen({ kind: "cards" })} />;
  if (screen.kind === "cards") {
    view = <CardsScreen onExit={() => setScreen({ kind: "home" })} />;
  } else if (screen.kind === "play") {
    const done = (result: { stars: number; detail: string }) =>
      setScreen({ kind: "result", mode: screen.mode, stars: result.stars, detail: result.detail, nonce: screen.nonce });
    const exit = () => setScreen({ kind: "home" });
    if (screen.mode === "quiz") view = <QuizScreen key={screen.nonce} onExit={exit} onDone={done} />;
    if (screen.mode === "order") view = <OrderScreen key={screen.nonce} onExit={exit} onDone={done} />;
    if (screen.mode === "memory") view = <MemoryScreen key={screen.nonce} onExit={exit} onDone={done} />;
    if (screen.mode === "story") view = <StoryScreen key={screen.nonce} onExit={exit} onDone={done} />;
  } else if (screen.kind === "result") {
    view = (
      <ResultScreen
        mode={screen.mode}
        stars={screen.stars}
        detail={screen.detail}
        onHome={() => setScreen({ kind: "home" })}
        onReplay={() => play(screen.mode)}
        onNext={play}
      />
    );
  }

  return (
    <FontProvider ok={fontOk}>
      <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-12">
        {ready ? view : <Splash />}
      </main>
    </FontProvider>
  );
}
