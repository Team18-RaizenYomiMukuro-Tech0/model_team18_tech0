"""#557: よくある失敗の上位 3 つを道具で塞ぐ（完了条件 #1〜#5）。

実行: python3 -m pytest scripts/test_tools_guard.py -q
"""
import json
import os
import subprocess
import tempfile
import unittest

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
with open(os.path.join(ROOT, ".claude", "settings.json"), encoding="utf-8") as f:
    SETTINGS = json.load(f)


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
            r = sh(["/bin/sh", "-c", cmd], env={"CLAUDE_PROJECT_DIR": t, "PATH": os.environ["PATH"]})
            self.assertEqual(r.returncode, 0)
            self.assertTrue(os.path.isdir(os.path.join(t, ".work", "tmp")))
        with tempfile.TemporaryDirectory() as empty:  # スクリプトが無くても 0
            r = sh(["/bin/sh", "-c", cmd], env={"CLAUDE_PROJECT_DIR": empty, "PATH": os.environ["PATH"]})
            self.assertEqual(r.returncode, 0)
        with open(os.path.join(ROOT, ".gitignore"), encoding="utf-8") as f:
            self.assertIn(".work/", f.read().split())

    def guard(self, command):
        r = sh(["python3", os.path.join(D, "guard-tmp-path.py")], input=json.dumps({"tool_input": {"command": command}}))
        return r

    def test_2_guard_blocks_missing(self):
        for c in ("cd /tmp/claude-501/no-such-id-557", "cp /tmp/x-no-such-557 .", "cat $TMPDIR/no-such-557"):
            env_cmd = c
            r = sh(["python3", os.path.join(D, "guard-tmp-path.py")],
                   input=json.dumps({"tool_input": {"command": env_cmd}}),
                   env={"TMPDIR": "/tmp", "PATH": os.environ["PATH"]})
            self.assertEqual(r.returncode, 2, c)
            self.assertIn(".work/tmp を使ってください", r.stderr)

    def test_2_guard_passes(self):
        with tempfile.TemporaryDirectory(dir="/tmp") as t:
            self.assertEqual(self.guard("cd " + t).returncode, 0)  # 存在するパス
        self.assertEqual(self.guard("mkdir -p /tmp/claude-501/new-557").returncode, 0)
        self.assertEqual(self.guard("echo hi > /tmp/out-557").returncode, 0)
        self.assertEqual(self.guard("ls /usr/bin").returncode, 0)
        self.assertEqual(sh(["python3", os.path.join(D, "guard-tmp-path.py")], input="{").returncode, 0)
        r = sh(["python3", os.path.join(D, "guard-tmp-path.py")],  # TMPDIR 未設定は判定できない
               input=json.dumps({"tool_input": {"command": "cat $TMPDIR/x"}}), env={"PATH": os.environ["PATH"]})
        self.assertEqual(r.returncode, 0)

    def test_2_hook_fail_open(self):
        cmd = SETTINGS["hooks"]["PreToolUse"][0]["hooks"][1]["command"]
        with tempfile.TemporaryDirectory() as empty:
            r = sh(["/bin/sh", "-c", cmd], env={"CLAUDE_PROJECT_DIR": empty, "PATH": os.environ["PATH"]}, input="{}")
            self.assertEqual(r.returncode, 0)

    def test_3_pyrun_missing(self):
        with tempfile.TemporaryDirectory() as t:
            r = sh([os.path.join(D, "pyrun"), "無い.py"], cwd=t)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("ファイルがありません", r.stderr)
            self.assertIn(os.path.join(t, "無い.py"), r.stderr)

    def test_4_pyrun_syntax_error(self):
        with tempfile.TemporaryDirectory() as t:
            bad = os.path.join(t, "bad.py")
            marker = os.path.join(t, "ran")
            with open(bad, "w", encoding="utf-8") as f:
                f.write("open(%r, 'w').write('x')\ndef (:\n" % marker)
            r = sh([os.path.join(D, "pyrun"), bad])
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("py_compile", r.stderr)
            self.assertFalse(os.path.exists(marker))
            good = os.path.join(t, "good.py")
            with open(good, "w", encoding="utf-8") as f:
                f.write("import sys; print('ok', sys.argv[1])\n")
            r = sh([os.path.join(D, "pyrun"), good, "a"])
            self.assertEqual((r.returncode, r.stdout.strip()), (0, "ok a"))

    def test_5_github_allowed_and_https(self):
        dom = SETTINGS["sandbox"]["network"]["allowedDomains"]
        self.assertEqual(sorted(dom), ["api.github.com", "github.com"])
        r = sh(["git", "-C", ROOT, "remote", "-v"])
        if "https://" not in r.stdout:
            self.skipTest("このクローンの origin は SSH: " + r.stdout.splitlines()[0])
        self.assertNotIn("git@", r.stdout)


if __name__ == "__main__":
    unittest.main()
