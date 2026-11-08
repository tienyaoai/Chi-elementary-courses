import { plain } from "../lib/bpmf.ts";
import { useProgress } from "../lib/progress.ts";
import { ui } from "../data/ui.ts";

export function SoundToggle() {
  const { progress, update } = useProgress();
  const label = progress.sound ? ui.mute : ui.unmute;
  return (
    <button
      type="button"
      className="emoji grid size-14 shrink-0 place-items-center rounded-full bg-white text-2xl shadow-[0_5px_0_#e4d2b4] active:translate-y-1 active:shadow-none focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#2c241c]"
      aria-label={plain(label)}
      aria-pressed={progress.sound}
      onClick={() => update((current) => ({ ...current, sound: !current.sound }))}
    >
      {progress.sound ? "🔊" : "🔇"}
    </button>
  );
}
