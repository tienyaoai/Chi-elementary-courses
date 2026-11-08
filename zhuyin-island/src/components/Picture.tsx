import type { Picture as PictureData } from "../data/content.ts";

export function Picture({ picture }: { picture: PictureData }) {
  if (picture.kind === "emoji") {
    return (
      <div className="emoji mx-auto grid size-36 place-items-center rounded-full bg-white text-7xl shadow-[0_8px_0_#e4d2b4]">
        {picture.emoji}
      </div>
    );
  }
  if (picture.kind === "digit") {
    return (
      <div className="system-font mx-auto grid size-36 place-items-center rounded-full bg-white text-7xl text-[#2c241c] shadow-[0_8px_0_#e4d2b4]">
        {picture.digit}
      </div>
    );
  }
  return (
    <div
      className="mx-auto size-36 rounded-full border-4 border-white shadow-[0_8px_0_#e4d2b4]"
      style={{ backgroundColor: picture.color, boxShadow: "inset 0 0 0 3px #e4d2b4, 0 8px 0 #e4d2b4" }}
    />
  );
}
