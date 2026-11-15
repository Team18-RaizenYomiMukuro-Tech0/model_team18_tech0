import { decisionChips, type ChipInput } from "@/lib/decisionChips";
import { Icon } from "./icons";
import styles from "./decisionChips.module.css";

// R4 SP-16 D-34: 決め手の 1 行。カード（SP-11・SP-15）と詳細（SP-12）で同じ部品・同じ値・並び・文言。
// 値の無い決め手は出さず、1 つも無ければ何も出さない。絵（箱・リボン）は飾りで読み上げさせない（意味は文字で伝える）。幅が足りなければ折り返す。
export function DecisionChips(props: Readonly<ChipInput>) {
  const chips = decisionChips(props);
  if (chips.length === 0) return null;
  return (
    <ul className={styles.chips} aria-label="決め手">
      {chips.map((c) => (
        <li key={c.key} className={styles.chip}>
          {c.icon && <Icon name={c.icon} size={18} />}
          {c.text}
        </li>
      ))}
    </ul>
  );
}
