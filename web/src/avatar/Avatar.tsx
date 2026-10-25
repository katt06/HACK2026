import { useMemo } from "react";
import { DEFAULT_AVATAR, SHOP_ITEMS, type EquippedAvatar } from "@contract";
import { GRID } from "./items";
import { avatarLayers, composeGrid, toRuns } from "./pixels";

export function describeAvatar(avatar: EquippedAvatar): string {
  const worn = Object.values(avatar).map((id) => SHOP_ITEMS[id!].name.toLowerCase());
  return worn.length ? `Capybara wearing ${worn.join(", ")}` : "Capybara";
}

// Pixel-art capybara. Sizes that are multiples of 32 (32, 64, 128…) keep every pixel square and sharp;
// crispEdges stops the browser from blurring the edges between them.
export function Avatar({
  avatar = DEFAULT_AVATAR,
  size = 64,
  className = "",
  label,
}: {
  avatar?: EquippedAvatar;
  size?: number;
  className?: string;
  label?: string; // accessible name; omit when the avatar is decoration next to a name
}) {
  const key = JSON.stringify(avatar);
  const runs = useMemo(() => toRuns(composeGrid(avatarLayers(avatar))), [key]);
  return (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {runs.map((r) => (
        <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.width} height={1} fill={r.color} />
      ))}
    </svg>
  );
}
