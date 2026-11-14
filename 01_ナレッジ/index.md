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

- [出力は正常なのに終了コード 1 で記録される](mistakes/exit1-but-output-ok.md) — 32回。記録のノイズの可能性（要確認）
- [一時ディレクトリのパスが無くなっている](mistakes/tmp-path-vanished.md) — 9回
- [zsh の glob が一致せずコマンドが止まる](mistakes/zsh-glob-no-match.md) — 5回
- [サンドボックスや証明書のせいで外部通信が失敗する](mistakes/sandbox-network-denied.md) — 4回
- [git 管理外のディレクトリで git/gh を実行している](mistakes/non-git-dir-command.md) — 3回
- [macOS(BSD) と GNU のコマンド差で失敗する](mistakes/macos-bsd-command-diff.md) — 3回
- [gh の使い方違い・ラベル不在・ブランチ保護でマージできない](mistakes/gh-usage-and-branch-policy.md) — 3回
- [ブランチの状態を確認せず git を実行して衝突する](mistakes/git-branch-state-conflict.md) — 3回
- [同じファイルを触る PR を並べる・他の PR の上に積んで衝突する](mistakes/parallel-pr-conflict.md) — 2回（2026-11-10。手書き）
- [証拠が完了条件と違うのに ○ にする・Draft で止める・パスを書き違える](mistakes/evidence-and-review-slips.md) — 3回（2026-11-11〜12。手書き）
- [Python のモジュールが無い（PIL）](mistakes/python-module-missing.md) — 2回

## 画面・運用の決まり

- [ハブの見た目の決まり](ハブの見た目の決まり.md) — 押せる所の形3つ・STAGE 4 の表示・早見表の自動生成（2026-11-07）
- [エージェント運用の決まり](エージェント運用の決まり.md) — 待たせない・done か blocked を必ず送る・`--admin` マージは PM の一言のみ・worktree（2026-11-07）
- [画面確認の学び](画面確認の学び.md) — 動きのあるページは動きを止めてから撮る（2026-11-07）
- [運営の回答から実装開始までの決定と学び](運営回答から実装開始までの決定と学び.md) — giftia_app を作れず案A・robots と noindex の両立・SSL は certifi・未決を先に決めない・実装開始の承認 #72（2026-11-08）
- [デプロイ成功でも本番が古い版だった学び](デプロイ成功でも本番が古い版だった学び.md) — zip デプロイが古い作り置きを消さず本番が約1日古かった。PR #262 の `clean: true`（効果は確認中）と、本番の版を確かめる決まり（2026-11-14）
