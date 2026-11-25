# ナレッジ目録（index）

記事を探すときはここから。追加したら必ず載せる。

## 共通

- [GitHub リポジトリ設定](GitHubリポジトリ設定.md) — main の保護・例外・ラベル。**Interaction limits の期限 2027-04-26 に要更新**（2026-10-26）

## 定期実行・自動化

- [週1要約の定期実行の導入手順（Mac / launchd）](定期実行の導入手順.md) — 失敗の記録を毎週月曜 09:00 に「型」へまとめる登録手順。確認用チェックリストつき（2026-10-26）
- [定期実行の導入手順（Windows）](定期実行の導入手順_Windows.md) — 同じ週1要約を Windows のタスクスケジューラで動かす手順。実機は未確認（2026-10-27）
- [PR レビュー ルーチンの設定手順（Claude Code クラウド）](レビュールーチンの設定手順.md) — AI レビューの作り方・起動タイミング・休止時間・未確認の点（2026-10-27 更新）
- [週1要約の指示文](weekly-digest-prompt.md) — 週1要約を AI が行うときの本文。launchd／タスクスケジューラ版もこれを読む（2026-10-26）
- [ナレッジ自動吸い上げ＆再発防止の設計](自動吸い上げ設計.md) — 失敗の吸い上げから再発防止までの設計（2026-10-19。現状との差は未確認）
- `deploy-checklist.md` — 週1要約が自動で書く（手で編集しない）

## ミスの型（週1要約が更新。発生回数の多い順）

- [出力は正常なのに終了コード 1 で記録される](mistakes/exit1-but-output-ok.md) — 153回。記録のノイズの可能性（要確認）
- [使い捨ての Python スクリプトが失敗する](mistakes/python-adhoc-script-errors.md) — 39回（Node の使い捨てスクリプトも含む）
- [一時ディレクトリのパスが無くなっている](mistakes/tmp-path-vanished.md) — 25回
- [長い heredoc が Git Bash で「unexpected EOF」になり、何も実行されない](mistakes/bash-heredoc-unexpected-eof.md) — 20回（新規 2026-11-23。Windows 機）
- [サンドボックスや証明書のせいで外部通信が失敗する](mistakes/sandbox-network-denied.md) — 16回（Azure の DB への接続のタイムアウトを含む）
- [ブランチの状態を確認せず git を実行して衝突する](mistakes/git-branch-state-conflict.md) — 15回
- [gh の使い方違い・ラベル不在・ブランチ保護でマージできない](mistakes/gh-usage-and-branch-policy.md) — 14回
- [zsh の glob が一致せずコマンドが止まる](mistakes/zsh-glob-no-match.md) — 14回
- [Windows の Python が cp932 で読み書きして、日本語や記号で落ちる](mistakes/windows-cp932-encoding.md) — 10回（新規 2026-11-23。Windows 機。週1要約のログの文字化けを含む）
- [macOS(BSD) と GNU のコマンド差で失敗する](mistakes/macos-bsd-command-diff.md) — 9回
- [今いる場所を思い違えて、無いパスを指定する](mistakes/wrong-relative-path.md) — 10回
- [git 管理外のディレクトリで git/gh を実行している](mistakes/non-git-dir-command.md) — 8回
- [シェルからの書き込みが拒否される（メモリ・一時領域）](mistakes/protected-path-write-denied.md) — 7回
- [Git Bash のパスと Windows のパスの書き方が混ざって失敗する](mistakes/windows-path-style-mismatch.md) — 7回（新規 2026-11-23。Windows 機）
- [入っていないコマンド（az・pandoc・soffice など）を呼んでしまう](mistakes/cli-tool-not-installed.md) — 5回
- [担当が報告を送らずに止まり、アプリに催促される](mistakes/stopped-without-report.md) — 4回（2026-11-20。手書き）。担当の定義に「止まる前に SendMessage」を足した
- [コマンドの書き方違い（tail・grep・jq・git の無いオプション）](mistakes/command-option-misuse.md) — 4回（新規 2026-11-23。Windows 機）
- [Python のモジュールが無い（PIL・certifi・fitz）](mistakes/python-module-missing.md) — 4回
- [ディスクが満杯（No space left on device）で git もコマンドも動かない](mistakes/disk-full-enospc.md) — 2回（新規 2026-11-26。tags に security）
- [証拠が完了条件と違うのに ○ にする・Draft で止める・パスを書き違える](mistakes/evidence-and-review-slips.md) — 3回（2026-11-11〜12。手書き）
- [同じファイルを触る PR を並べる・他の PR の上に積んで衝突する](mistakes/parallel-pr-conflict.md) — 2回（2026-11-10。手書き）
- [利用者の判断を、質問の道具でなく返事の文章で聞いて止まる](mistakes/question-in-text-not-asked.md) — 2回（2026-11-23。手書き）
- [新しい作業フォルダに node_modules や .venv が無く、テストが動かない](mistakes/worktree-missing-deps.md) — 2回（新規 2026-11-23。Windows 機）
- [GitHub 側の一時的なエラー（502）で gh が失敗する](mistakes/github-transient-5xx.md) — 1回（新規 2026-11-23）
- [画面確認で押したいボタンが別の要素に隠れていて押せない](mistakes/browser-element-covered.md) — 1回（新規 2026-11-23）
- [担当の作業フォルダに自動で作られたファイルが残り、依頼が止まる](mistakes/untracked-file-blocks-assign.md) — 1回（2026-11-20。手書き）
- [作業フォルダの強制削除で、未コミットの記録が消える](mistakes/worktree-force-remove-loses-uncommitted.md) — 1回（2026-11-13。手書き）

## 11/24 の発表の後の学び（2026-11-25）

- [速さの検査で遅さを見つけられなかった学び](速さの検査で遅さを見つけられなかった学び.md) — 検索の全件取り直し（D-04）を検査が見逃した理由 4 点・設計で考えること 4 点・確かめる仕組みの案 5 つ（案。未決）。ADR-023（2026-11-25）
- [共有リンクが約 60 秒止まった件の見立て](共有リンクが約60秒止まった件の見立て.md) — 画面側の CPU 不足という見立てと対策案 A〜F。原因は未確定（PM の Azure 確認待ち）。PR #704（2026-11-25）
- [Azure Functions は眠った後の最初の 1 回が約 3 秒遅い](AzureFunctionsは眠った後の最初の1回が遅い.md) — Always-ready が 0 の見立て。PM は「Always-ready を 1 にする案は実施しない」と決定。Issue #721（2026-11-25）
- [AI レビューのルーチンは自分の PR を飛ばす](AIレビューのルーチンは自分のPRを飛ばす.md) — 設定した人が少ないと、設定していない人の PR を AI が誰も見ない。PM は「今のまま」と決定（2026-11-25）
- [テストの配分の見直し](テストの配分の見直し.md) — 描画テストと通しの確認が 0 本だった・ADR-024（Vitest・Playwright）・V-01〜V-24／VE-01〜VE-06。PR #709・#712・#715・#717・#719・#720（2026-11-25）
- [main へのマージの承認は入力欄に打つ](mainへのマージの承認は入力欄に打つ.md) — 質問の画面の答えだけでは自動の判定に止められた（#719）。入力欄に「承認します」（2026-11-25）
- [11/25 の実運用のセキュリティのレビューの学び 6 つ](セキュリティのレビューの学び.md) — 公開の PR に名前・パスが出る／禁止は道具ごと（#726 で直した）／`.gitignore` と `.git/info/exclude`／書き込み API の上限は設計で決める／AI の権限は PM と同じ／ディスク満杯。#726・#700（2026-11-25）。決まりにする所は案

## 画面・運用の決まり

- [ハブの見た目の決まり](ハブの見た目の決まり.md) — 押せる所の形3つ・STAGE 4 の表示・早見表の自動生成（2026-11-07）
- [エージェント運用の決まり](エージェント運用の決まり.md) — 待たせない・done か blocked を必ず送る・`--admin` マージは PM の一言のみ・worktree（2026-11-07）
- [画面確認の学び](画面確認の学び.md) — 動きのあるページは動きを止めてから撮る（2026-11-07）
- [運営の回答から実装開始までの決定と学び](運営回答から実装開始までの決定と学び.md) — giftia_app を作れず案A・robots と noindex の両立・SSL は certifi・未決を先に決めない・実装開始の承認 #72（2026-11-08）
- [デプロイ成功でも本番が古い版だった学び](デプロイ成功でも本番が古い版だった学び.md) — zip デプロイが古い作り置きを消さず本番が約1日古かった。PR #262 の `clean: true`（効いた）と、本番の版を確かめる決まり（2026-11-14）
- [2026-11-15 の決定の記録](2026-11-15の決定の記録.md) — 朝の決定 7 つ・表の作成を AI が代行した 1 回だけの例外・テスト実行手順書はりゅうちゃん・ハブの段「3.5 実装③ 聖光気」（2026-11-15）
- [2026-11-15 午後の決定の記録](2026-11-15午後の決定の記録.md) — いいね 3 点・速さは 2 秒・#331/#332 の決定・初回提出版の固定・主要フロー図は案A。学び: 見た目の判断は HTML で見比べる（2026-11-15）
- [2026-11-15 夕方の決定の記録](2026-11-15夕方の決定の記録.md) — 主要フロー図 ①〜⑤・タブと札の形・計測の数え方・モックの固定版・配色は淡色 9 色。学び: 図は主張を見出しに／形で分ける／決定の正本は repo に（2026-11-15）
