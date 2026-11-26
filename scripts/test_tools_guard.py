"""#557: よくある失敗の上位 3 つを道具で塞ぐ（完了条件 #1〜#5）。

実行: python3 -m pytest scripts/test_tools_guard.py -q
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
with open(os.path.join(ROOT, ".claude", "settings.json"), encoding="utf-8") as f:
    SETTINGS = json.load(f)

import shutil

# Windows（Git Bash）でも動かすための道具。Mac・Linux では今までと同じ動き。
SH = "/bin/sh" if os.path.exists("/bin/sh") else (shutil.which("sh") or "sh")
PY = sys.executable


def base_env(**extra):
    """最小の環境変数。Windows の Python は SYSTEMROOT が無いと起動できないので残す。"""
    env = {"PATH": os.environ["PATH"], "PYTHONUTF8": "1"}
    for k in ("SYSTEMROOT", "SystemRoot", "TEMP", "TMP", "LOCALAPPDATA", "USERPROFILE"):
        if k in os.environ:
            env[k] = os.environ[k]
    env.update(extra)
    return env

# Git Bash の /tmp が、この Python から見てどこか
TMP_REAL = "/tmp" if os.name != "nt" else tempfile.gettempdir()


def as_tmp(real):
    """TMP_REAL の下の実パスを、コマンドに書く /tmp/... の形にする。"""
    return "/tmp/" + os.path.relpath(real, TMP_REAL).replace(os.sep, "/")


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", **kw)


class Tools(unittest.TestCase):
    def test_1_session_workdir(self):
        cmd = SETTINGS["hooks"]["SessionStart"][0]["hooks"][0]["command"]
        with tempfile.TemporaryDirectory() as t:
            os.makedirs(os.path.join(t, "scripts"))
            with open(os.path.join(D, "session-workdir.sh"), encoding="utf-8") as src, \
                    open(os.path.join(t, "scripts", "session-workdir.sh"), "w", encoding="utf-8") as dst:
                dst.write(src.read())
            r = sh([SH, "-c", cmd], env=base_env(CLAUDE_PROJECT_DIR=t))
            self.assertEqual(r.returncode, 0)
            self.assertTrue(os.path.isdir(os.path.join(t, ".work", "tmp")))
        with tempfile.TemporaryDirectory() as empty:  # スクリプトが無くても 0
            r = sh([SH, "-c", cmd], env=base_env(CLAUDE_PROJECT_DIR=empty))
            self.assertEqual(r.returncode, 0)
        with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
            self.assertIn(".work/", f.read().split())

    def guard(self, command):
        r = sh([PY, os.path.join(D, "guard-tmp-path.py")], input=json.dumps({"tool_input": {"command": command}}),
               env=base_env())
        return r

    def test_2_guard_blocks_missing(self):
        for c in ("cd /tmp/claude-501/no-such-id-557", "cd /tmp/no-such-557", "cp /tmp/no-such-557/x .",
                  "cat /tmp/no-such-557/no-such/f", "cat $TMPDIR/no-such-557/f"):
            env_cmd = c
            r = sh([PY, os.path.join(D, "guard-tmp-path.py")],
                   input=json.dumps({"tool_input": {"command": env_cmd}}),
                   env=base_env(TMPDIR="/tmp"))
            self.assertEqual(r.returncode, 2, c)
            self.assertIn(".work/tmp を使ってください", r.stderr)

    def test_2_guard_passes(self):
        with tempfile.TemporaryDirectory(dir=TMP_REAL) as t:
            self.assertEqual(self.guard("cd " + as_tmp(t)).returncode, 0)  # 存在するパス
        with tempfile.TemporaryDirectory(dir=TMP_REAL) as real:  # これから作るパス（親はある）
            t = as_tmp(real)
            for c in ("cp a %s/new" % t, "git worktree add %s/new x" % t, "git clone u %s/new" % t):
                self.assertEqual(self.guard(c).returncode, 0, c)
        self.assertEqual(self.guard("mkdir -p /tmp/claude-501/new-557").returncode, 0)
        self.assertEqual(self.guard("echo hi > /tmp/out-557").returncode, 0)
        self.assertEqual(self.guard("ls /usr/bin").returncode, 0)
        self.assertEqual(sh([PY, os.path.join(D, "guard-tmp-path.py")], input="{", env=base_env()).returncode, 0)
        r = sh([PY, os.path.join(D, "guard-tmp-path.py")],  # TMPDIR 未設定は判定できない
               input=json.dumps({"tool_input": {"command": "cat $TMPDIR/x"}}), env=base_env())
        self.assertEqual(r.returncode, 0)

    def test_2_hook_fail_open(self):
        cmd = SETTINGS["hooks"]["PreToolUse"][0]["hooks"][1]["command"]
        with tempfile.TemporaryDirectory() as empty:
            r = sh([SH, "-c", cmd], env=base_env(CLAUDE_PROJECT_DIR=empty), input="{}")
            self.assertEqual(r.returncode, 0)

    def test_3_pyrun_missing(self):
        with tempfile.TemporaryDirectory() as t:
            r = sh([SH, os.path.join(D, "pyrun"), "無い.py"], cwd=t)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("ファイルがありません", r.stderr)
            # Windows の sh は $PWD を /c/Users/... の形で出すので、フォルダ名で確かめる
            want = os.path.join(t, "無い.py") if os.name != "nt" else os.path.basename(t) + "/無い.py"
            self.assertIn(want, r.stderr)

    def test_4_pyrun_syntax_error(self):
        with tempfile.TemporaryDirectory() as t:
            bad = os.path.join(t, "bad.py")
            marker = os.path.join(t, "ran")
            with open(bad, "w", encoding="utf-8") as f:
                f.write("open(%r, 'w').write('x')\ndef (:\n" % marker)
            r = sh([SH, os.path.join(D, "pyrun"), bad])
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("py_compile", r.stderr)
            self.assertFalse(os.path.exists(marker))
            good = os.path.join(t, "good.py")
            with open(good, "w", encoding="utf-8") as f:
                f.write("import sys; print('ok', sys.argv[1])\n")
            r = sh([SH, os.path.join(D, "pyrun"), good, "a"])
            self.assertEqual((r.returncode, r.stdout.strip()), (0, "ok a"))

    def test_5_github_allowed_and_https(self):
        dom = SETTINGS["sandbox"]["network"]["allowedDomains"]
        self.assertEqual(sorted(dom), ["api.github.com", "github.com"])
        r = sh(["git", "-C", ROOT, "remote", "-v"])
        if not r.stdout.strip():
            self.skipTest("origin がまだ無い（キットを置いただけのフォルダなど）")
        if "https://" not in r.stdout:
            self.skipTest("このクローンの origin は SSH: " + r.stdout.splitlines()[0])
        self.assertNotIn("git@", r.stdout)


if __name__ == "__main__":
    unittest.main()
