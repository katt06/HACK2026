// A "+30 pts" that floats up and fades. Render it with a fresh `key` to replay.
export function PointsBurst({ points }: { points: number }) {
  return (
    <span
      aria-hidden
      className="animate-points-burst pointer-events-none absolute left-1/2 top-0 z-20 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1 text-lg font-bold text-white shadow-lg"
    >
      +{points} pts
    </span>
  );
}
