"""#552: フックが壊れても作業を止めない（完了条件 #1〜#5）と、#546 の 6 通りの確認。

実行: python3 -m pytest scripts/test_hooks_fail_open.py -q
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
STOP_SCRIPT = os.path.join(D, "require-report-before-stop.py")
with open(os.path.join(ROOT, ".claude", "settings.json"), encoding="utf-8") as f:
    SETTINGS = json.load(f)

import shutil

# Windows（Git Bash）でも動かすための道具。Mac・Linux では今までと同じ動き。
SH = "/bin/sh" if os.path.exists("/bin/sh") else (shutil.which("sh") or "sh")
PY = sys.executable


def base_env(**extra):
    """最小の環境変数。Windows の Python は SYSTEMROOT が無いと起動できないので残す。"""
    env = {"PATH": os.environ["PATH"], "PYTHONUTF8": "1"}
    for k in ("SYSTEMROOT", "SystemRoot", "SYSTEMDRIVE", "SystemDrive", "TEMP", "TMP", "LOCALAPPDATA", "USERPROFILE"):
        if k in os.environ:
            env[k] = os.environ[k]
    env.update(extra)
    return env

HOOKS = {
    "guard-worktree-remove": SETTINGS["hooks"]["PreToolUse"][0]["hooks"][0]["command"],
    "collect-mistake": SETTINGS["hooks"]["PostToolUseFailure"][0]["hooks"][0]["command"],
    "require-report-before-stop": SETTINGS["hooks"]["Stop"][0]["hooks"][0]["command"],
}


def run_command(command, project_dir, stdin="{}", path=None):
    env = base_env(CLAUDE_PROJECT_DIR=project_dir)
    if path is not None:
        env["PATH"] = path
    return subprocess.run([SH, "-c", command], input=stdin, capture_output=True, text=True,
                          encoding="utf-8", env=env)


class FailOpen(unittest.TestCase):
    def test_1_script_missing(self):  # 完了条件 #1
        with tempfile.TemporaryDirectory() as empty:
            for name, cmd in HOOKS.items():
                r = run_command(cmd, empty)
                self.assertEqual((r.returncode, r.stdout), (0, ""), name)

    def test_2_no_python(self):  # 完了条件 #2
        with tempfile.TemporaryDirectory() as nopath:
            for name, cmd in HOOKS.items():
                r = run_command(cmd, ROOT, path=nopath)
                self.assertEqual(r.returncode, 0, name)

    def test_3_broken_input(self):  # 完了条件 #3（2 を返さない）
        for name, cmd in HOOKS.items():
            r = run_command(cmd, ROOT, stdin="{")
            self.assertEqual(r.returncode, 0, name)
            self.assertNotEqual(r.returncode, 2, name)


class ReportTarget(unittest.TestCase):
    def test_4_no_hardcoded_name(self):  # 完了条件 #4
        with open(STOP_SCRIPT, encoding="utf-8") as f:
            self.assertNotIn("model-team18-tech0-rijicho", f.read())

    def _reason(self, env_value):
        with tempfile.TemporaryDirectory() as t:
            tr = os.path.join(t, "t.jsonl")
            with open(tr, "w", encoding="utf-8") as f:
                f.write(json.dumps({"type": "user", "message": {"content": "依頼"}}) + "\n")
            env = {k: v for k, v in os.environ.items() if k != "REPORT_TO_SESSION"}
            env["PYTHONUTF8"] = "1"
            if env_value is not None:
                env["REPORT_TO_SESSION"] = env_value
            r = subprocess.run([sys.executable, STOP_SCRIPT], capture_output=True, text=True, encoding="utf-8", env=env,
                               input=json.dumps({"cwd": "/x/.command-center/worktrees/y", "transcript_path": tr}))
            self.assertEqual(r.returncode, 0)
            return json.loads(r.stdout)["reason"]

    def test_4_name_from_env(self):
        self.assertIn("model-team18-tech0-rijicho", self._reason("model-team18-tech0-rijicho"))

    def test_4_without_env_falls_back(self):
        reason = self._reason(None)
        self.assertIn("りじちょー", reason)
        self.assertNotIn("model-team18", reason)

    def test_settings_env_has_name(self):
        self.assertEqual(SETTINGS["env"]["REPORT_TO_SESSION"], "model-team18-tech0-rijicho")


class Stop546(unittest.TestCase):
    """#546 の 6 通り。"""

    def run_stop(self, data, lines=None):
        with tempfile.TemporaryDirectory() as t:
            tr = os.path.join(t, "t.jsonl")
            if lines is not None:
                with open(tr, "w", encoding="utf-8") as f:
                    f.write("\n".join(json.dumps(x) for x in lines) + "\n")
            data = dict(data, transcript_path=tr)
            r = subprocess.run([sys.executable, STOP_SCRIPT], input=data if isinstance(data, str) else json.dumps(data),
                               capture_output=True, text=True, encoding="utf-8", env=base_env())
        self.assertEqual(r.returncode, 0)
        return r.stdout

    WT = "/repo/.command-center/worktrees/552-kurosu"
    U = {"type": "user", "message": {"content": "依頼"}}
    SEND = {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "SendMessage"}]}}
    NOTE = {"type": "user", "message": {"content": "<task-notification>done</task-notification>"}}

    def test_a_worktree_not_sent_blocks(self):
        self.assertIn('"block"', self.run_stop({"cwd": self.WT}, [self.U]))

    def test_b_rijicho_dir_passes(self):
        self.assertEqual(self.run_stop({"cwd": "/repo"}, [self.U]), "")

    def test_c_stop_hook_active_passes(self):
        self.assertEqual(self.run_stop({"cwd": self.WT, "stop_hook_active": True}, [self.U]), "")

    def test_d_fake_transcript_blocks(self):
        self.assertIn('"block"', self.run_stop({"cwd": self.WT}, [self.U, {"type": "assistant", "message": {"content": [{"type": "text", "text": "x"}]}}]))

    def test_e_woken_by_notification_after_send_passes(self):
        self.assertEqual(self.run_stop({"cwd": self.WT}, [self.U, self.SEND, self.NOTE]), "")

    def test_f_broken_input_passes(self):
        r = subprocess.run([sys.executable, STOP_SCRIPT], input="{", capture_output=True, text=True)
        self.assertEqual((r.returncode, r.stdout), (0, ""))


if __name__ == "__main__":
    unittest.main()
