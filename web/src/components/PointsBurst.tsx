// A "+30 pts" that floats up and fades. Render it with a fresh `key` to replay.
export function PointsBurst({ points }: { points: number }) {
  return (
    <span
      aria-hidden
      className="animate-points-burst pointer-events-none absolute left-1/2 top-0 z-20 whitespace-nowrap rounded-full border-2 border-coin-edge bg-coin px-3 py-1 text-lg font-black text-on-coin shadow-lg"
    >
      +{points} pts
    </span>
  );
}
