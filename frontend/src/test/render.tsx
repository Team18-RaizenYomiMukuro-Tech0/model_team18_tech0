// 描画の入口。画面をまたぐ状態（AppState）を付けて描く。
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppStateProvider } from "@/state/AppState";

export const renderWithState = (ui: ReactElement) => render(<AppStateProvider>{ui}</AppStateProvider>);
