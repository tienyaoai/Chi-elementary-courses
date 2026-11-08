import { plain } from "../lib/bpmf.ts";
import { starCount } from "../data/ui.ts";

export function Stars({ value, max = 3, size = 22 }: { value: number; max?: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={plain(starCount(value))}>
      {Array.from({ length: max }, (_, index) => (
        <svg key={index} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.6 14.7 8.8 21.4 9.5 16.4 14.1 17.8 20.7 12 17.3 6.2 20.7 7.6 14.1 2.6 9.5 9.3 8.8Z"
            fill={index < value ? "#f0b429" : "#eadfce"}
            stroke={index < value ? "#d49612" : "#d9cbb8"}
            strokeWidth="1"
          />
        </svg>
      ))}
    </span>
  );
}
