import { createContext, useContext, useState } from "react";

interface GameContextValue {
  gameName: string;
  setGameName: (name: string) => void;
}

const GameContext = createContext<GameContextValue>({
  gameName: "",
  setGameName: () => {},
});

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameName, setGameName] = useState("");
  return (
    <GameContext.Provider value={{ gameName, setGameName }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
