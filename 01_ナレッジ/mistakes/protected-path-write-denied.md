---
title: シェルからの書き込みが「operation not permitted」で拒否される（メモリ・一時領域）
type: knowledge
origin: internal
tags: [mistake]
created: 2026-11-16
updated: 2026-11-16
---

# シェルからの書き込みが「operation not permitted」で拒否される（メモリ・一時領域）

- 発生回数: 7（2026-11-09〜11-15 の収集分。初回要約）
- 最終発生日: 2026-11-15
- 収集源: claude-bash
- デプロイ系: いいえ

## 症状・実行コマンド

- `echo '- [...](reply-in-japanese.md) — ...' >> ~/.claude/projects/.../memory/MEMORY.md` → `(eval):1: operation not permitted`（5回。メモリのファイルへの追記・`cat >` ・`cd` して `MEMORY.md` へ追記）
- `Error: Cannot write to file /var/folders/.../T/<UUID>`（終了コード 13、2回）

## 原因

ログから: サンドボックスが書き込みを許す場所を絞っており、メモリディレクトリと `/var/folders/.../T/` はシェルからの書き込みが通らない。なぜその場所だけ拒否されるかの設定は要確認。

## 直し方 / 再発防止

- メモリの追記・更新は Write / Edit ツールで行い、シェルのリダイレクト（`>>`）で書かない。
- 一時ファイルは許可された場所（`$TMPDIR` ではなく、作業ツリー内や `/private/tmp/claude-<uid>/…`）に作る。使う前に `mkdir -p`（[[tmp-path-vanished]]）。
