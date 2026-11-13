import { SearchForm } from "@/components/SearchForm";

// F2 #63: 候補の一覧と「選んだ候補」の欄の置き場（F1 の SearchForm に載せる）。
// 検索結果 `/search` への載せ替えは R3 #120（キックオフ記録 #86 の 6）。それまでの確認用の入口。
export const metadata = { title: "候補の確認（F2）" };

export default function CandidatesPage() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
      <SearchForm />
    </div>
  );
}
