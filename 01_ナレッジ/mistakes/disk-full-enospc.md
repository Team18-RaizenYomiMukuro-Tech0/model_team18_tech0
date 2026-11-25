---
title: ディスクが満杯（No space left on device）で git もコマンドも動かない
type: knowledge
origin: internal
tags: [mistake, security]
created: 2026-11-26
updated: 2026-11-26
---

# ディスクが満杯（No space left on device）で git もコマンドも動かない

- 発生回数: 2（2026-11-26 の収集分。初回要約。どちらも 2026-11-25 の同じ機）
- 最終発生日: 2026-11-25
- 収集源: claude-bash
- デプロイ系: いいえ
- 関連: [[セキュリティのレビューの学び]] の §6（ディスクが満杯になると、AI は何もできなくなる）

## 症状・実行コマンド

- `git worktree add -q -b chore/ignore-command-center "$W" origin/main && printf … >> "$W/.gitignore" && …`（14:36）→ `error: unable to write file docs/mock/screenshots/….png`、`No space left on device`、`fatal: cannot create directory at 'docs/pdf': No space left on device`（`Exit code 128`）。作業フォルダの作成が途中で止まった。
- `ls -la $S/idx* …; rm -f $S/idx …; df -h … | tail -1; du -sh … | sort -h | tail -4`（14:39。空きを調べて消そうとした）→ コマンドは実行されず、「this computer's disk is full (ENOSPC) on the volume holding …（Claude Code の一時ディレクトリ）… so the file that captures command output could not be created」。出力を受け取るファイルが作れないので、`df` も動かない。ツール側の案内は「空きを作る、または `CLAUDE_CODE_TMPDIR` を別のボリュームに向けて再起動する。本人の機なら、消す前に本人へ伝える」。

## 原因

ログから: ディスクの空きが無い。ログに空きの数字は無い。同じ日の別の記録（[[セキュリティのレビューの学び]] §6）では、担当の作業フォルダ 23 個で 4.9GB、空きが 124MB だった。この記録だけからは、何が空きを使ったかは分からない（その記事の数字は、ログの原本では未確認）。

## 直し方 / 再発防止

- 満杯になると、`git worktree add` のような書き込みも、コマンドの出力の受け取りも止まる。自分で大きく消す前に、まず PM に伝える（ツールの案内どおり。作業フォルダや記憶は他の担当のもの）。
- 作業フォルダ（worktree）は、案件が終わったら消す。消す前に、未コミットの記録が無いか見る（[[worktree-force-remove-loses-uncommitted]]）。
- 途中で止まった `git worktree add` は、半分できた作業フォルダが残るおそれがある。`git worktree list` と `ls` で確かめてから作り直す（推定。要確認）。
- 空きが少ないことを、満杯になる前に知らせる仕組みは、まだ無い（案。[[セキュリティのレビューの学び]] §6）。

## セキュリティとの関わり

- 満杯の間は、作業の記録（失敗のログ・コミット）が書けず、途中のファイルが壊れたまま残る。記録を守るという意味で、運用の可用性の問題。
- 空きを作るために消す操作は、他の人・担当の未コミットの物を消すおそれがある。消す前の確認が要る。
