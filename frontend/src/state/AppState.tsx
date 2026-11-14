"use client";

import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { trackFirstLoad } from "../lib/tracking.ts";
import { initialState, reducer, type AppState as State, type Candidate } from "./selection.ts";

// D-32: 画面をまたぐ状態の置き場（app/layout に1つ置く React Context。ページ移動しても残り、再読込で消える）。
type Api = {
  picked: readonly Candidate[];
  lastR01: readonly Candidate[] | null;
  isPicked: (productId: string) => boolean;
  pick: (item: Candidate) => void;
  unpick: (productId: string) => void;
  setLastR01: (items: readonly Candidate[]) => void;
};

const Ctx = createContext<Api | null>(null);

export function AppStateProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [state, dispatch] = useReducer(reducer, initialState satisfies State);
  // ① サイトに来る（SP-34）: 最初に開いたとき 1 回。URL の giftia_test は取り込んで URL から取り除く（K-5）。同じ訪問の同じ段はサーバーが最初の 1 件だけ残す
  useEffect(() => {
    const { cleaned } = trackFirstLoad({ pathname: window.location.pathname, search: window.location.search });
    if (cleaned !== null) window.history.replaceState(window.history.state, "", `${window.location.pathname}${cleaned}${window.location.hash}`);
  }, []);
  const api = useMemo<Api>(
    () => ({
      picked: [...state.picked.values()],
      lastR01: state.lastR01,
      isPicked: (id) => state.picked.has(id),
      pick: (item) => dispatch({ type: "pick", item }),
      unpick: (productId) => dispatch({ type: "unpick", productId }),
      setLastR01: (items) => dispatch({ type: "setLastR01", items }),
    }),
    [state],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAppState(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppStateProvider の中で使ってください");
  return v;
}
