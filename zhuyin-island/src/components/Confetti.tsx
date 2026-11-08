const colors = ["#ff8a3d", "#ffd15a", "#3cbf7a", "#3aa0e8", "#ff7aa2", "#fff"];

export function Confetti({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {colors.flatMap((color, colorIndex) =>
        [0, 1, 2].map((copy) => {
          const index = colorIndex * 3 + copy;
          return (
            <span
              key={`${color}-${copy}`}
              className="confetti-bit"
              style={{
                left: `${(index * 17) % 100}%`,
                background: color,
                animationDelay: `${(index % 5) * 0.06}s`,
              }}
            />
          );
        }),
      )}
    </div>
  );
}
