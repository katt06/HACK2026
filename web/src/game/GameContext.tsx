import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import { api, type GameState } from "../api";
import { Celebration, type CelebrationItem } from "./Celebration";

interface GameContextValue {
  state: GameState | null;
  // Call after anything that can earn XP, coins, or badges. Level-ups and new badges celebrate automatically.
  refresh: () => Promise<void>;
}

const GameContext = createContext<GameContextValue>({ state: null, refresh: async () => {} });

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [queue, setQueue] = useState<CelebrationItem[]>([]);
  const previous = useRef<GameState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api.getGameState();
      const before = previous.current;
      if (before) {
        const items: CelebrationItem[] = [];
        if (next.level > before.level) items.push({ kind: "level", level: next.level });
        for (const badge of next.badges) {
          if (badge.earned && !before.badges.find((b) => b.id === badge.id)?.earned) items.push({ kind: "badge", id: badge.id });
        }
        if (items.length) setQueue((q) => [...q, ...items]);
      }
      previous.current = next;
      setState(next);
    } catch (err) {
      // The game layer is decoration: keep the last known state and never show an error.
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const current = queue[0];
  return (
    <GameContext.Provider value={{ state, refresh }}>
      {children}
      <AnimatePresence>
        {current && (
          <Celebration
            key={current.kind === "level" ? `level-${current.level}` : `badge-${current.id}`}
            item={current}
            onDismiss={() => setQueue((q) => q.slice(1))}
          />
        )}
      </AnimatePresence>
    </GameContext.Provider>
  );
}

export const useGame = () => useContext(GameContext);
