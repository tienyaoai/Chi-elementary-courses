import { cx } from "../lib/cx.ts";

export function Mascot({
  mood = "idle",
  className,
}: {
  mood?: "idle" | "happy" | "cheer";
  className?: string;
}) {
  const happy = mood === "happy" || mood === "cheer";
  return (
    <svg
      viewBox="0 0 140 140"
      className={cx("mascot", mood === "idle" && "mascot-idle", mood === "cheer" && "mascot-cheer", className)}
      aria-hidden="true"
    >
      <ellipse cx="70" cy="124" rx="34" ry="7" fill="#000" opacity="0.08" />
      <rect x="98" y="62" width="28" height="38" rx="10" fill="#ff7aa2" />
      <rect x="104" y="70" width="16" height="12" rx="4" fill="#ffe4ee" />
      <circle cx="68" cy="74" r="40" fill="#ffd15a" />
      <ellipse cx="68" cy="88" rx="20" ry="15" fill="#fff3c9" />
      <circle cx="50" cy="86" r="5" fill="#ffb4c8" />
      <circle cx="86" cy="86" r="5" fill="#ffb4c8" />
      {happy ? (
        <>
          <path d="M46 68q7 9 14 0" fill="none" stroke="#2c241c" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M76 68q7 9 14 0" fill="none" stroke="#2c241c" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M58 94q10 8 18 0" fill="none" stroke="#2c241c" strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="54" cy="70" r="4.4" fill="#2c241c" />
          <circle cx="84" cy="70" r="4.4" fill="#2c241c" />
          <circle cx="55.6" cy="68.4" r="1.4" fill="#fff" />
          <circle cx="85.6" cy="68.4" r="1.4" fill="#fff" />
        </>
      )}
      <path d="M62 80h12l-6 8z" fill="#ff8a3d" />
      <ellipse cx="38" cy="90" rx="11" ry="7" fill="#ffcf4a" transform="rotate(-18 38 90)" />
      <rect x="24" y="78" width="7" height="24" rx="2" fill="#3aa0e8" transform="rotate(-28 27 90)" />
    </svg>
  );
}
