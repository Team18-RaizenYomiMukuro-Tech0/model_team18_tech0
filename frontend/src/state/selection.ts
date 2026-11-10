// D-32 SP-04 SP-15 #45-1 #46-1: 画面をまたぐ状態の中身（React を使わない純粋な部分）。
// 選択（商品ID＋選んだ時点の表示用の情報）と、R-01 の最後の結果を持つ。
// 保存しない: localStorage・sessionStorage・cookie には書かない（再読込で消える。SP-04）。
// お気に入り・カートは保存側が正なので、ここには写さない。

export type Candidate = {
  productId: number;
  name: string;
  price: number;
  reason?: string; // R-01 の候補だけが持つ（R-02 の商品には無い）
};

export type AppState = {
  // 選んだ順（最初に選んだ順。SP-05 の「最初の出現順」と同じ）。キーは商品ID
  picked: ReadonlyMap<number, Candidate>;
  lastR01: readonly Candidate[] | null;
};

export type Action =
  | { type: "pick"; item: Candidate }
  | { type: "unpick"; productId: number }
  | { type: "setLastR01"; items: readonly Candidate[] };

export const initialState: AppState = { picked: new Map(), lastR01: null };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "pick": {
      if (state.picked.has(action.item.productId)) return state; // 同じ商品IDは1件のまま
      const picked = new Map(state.picked);
      picked.set(action.item.productId, action.item);
      return { ...state, picked };
    }
    case "unpick": {
      if (!state.picked.has(action.productId)) return state;
      const picked = new Map(state.picked);
      picked.delete(action.productId);
      return { ...state, picked };
    }
    case "setLastR01":
      // R-02 に切り替えても選択は残す（#46-1）。ここは結果だけ入れ替える
      return { ...state, lastR01: action.items };
  }
}
