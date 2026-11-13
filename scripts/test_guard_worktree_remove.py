import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest

D = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(D, "guard-worktree-remove.py")
spec = importlib.util.spec_from_file_location("gwr", SCRIPT)
gwr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gwr)


def run_hook(command, cwd):
    r = subprocess.run([sys.executable, SCRIPT], input=json.dumps({"tool_input": {"command": command}, "cwd": cwd}),
                       capture_output=True, text=True, encoding="utf-8")
    return r.returncode, r.stderr


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        root = cls.tmp.name
        cls.repo = os.path.join(root, "repo")
        g = lambda *a, cwd=None: subprocess.run(["git", *a], cwd=cwd or cls.repo, check=True, capture_output=True)
        os.makedirs(cls.repo)
        g("init", "-q")
        g("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "init")
        with open(os.path.join(cls.repo, ".gitignore"), "w") as f:
            f.write(".env\n")
        g("add", ".gitignore")
        g("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", "ignore")
        cls.dirty = os.path.join(root, "wt-dirty")
        cls.clean = os.path.join(root, "wt-clean")
        cls.ignored = os.path.join(root, "wt-ignored")
        for p in (cls.dirty, cls.clean, cls.ignored):
            g("worktree", "add", "-q", "--detach", p)
        with open(os.path.join(cls.dirty, "record.md"), "w") as f:
            f.write("x")
        with open(os.path.join(cls.ignored, ".env"), "w") as f:
            f.write("x")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_force_with_untracked_file_is_blocked(self):
        code, err = run_hook(f"git worktree remove --force {self.dirty}", self.repo)
        self.assertEqual(code, 2)
        self.assertIn("record.md", err)

    def test_short_f_and_dash_C_and_relative_path(self):
        code, _ = run_hook("cd x && git -C repo worktree remove -f ../wt-dirty", os.path.dirname(self.repo))
        self.assertEqual(code, 2)

    def test_windows_and_git_bash_paths(self):
        self.assertEqual(run_hook("git worktree remove --force " + self.dirty.replace("/", "\\"), self.repo)[0], 2)
        if os.name == "nt":
            drive, rest = os.path.splitdrive(self.dirty)
            msys = "/" + drive[0].lower() + rest.replace("\\", "/")
            self.assertEqual(run_hook(f"git worktree remove --force {msys}", self.repo)[0], 2)

    def test_force_on_clean_worktree_is_allowed(self):
        self.assertEqual(run_hook(f"git worktree remove --force {self.clean}", self.repo)[0], 0)

    def test_ignored_files_do_not_block(self):
        self.assertEqual(run_hook(f"git worktree remove --force {self.ignored}", self.repo)[0], 0)

    def test_without_force_is_not_checked(self):
        self.assertEqual(run_hook(f"git worktree remove {self.dirty}", self.repo)[0], 0)

    def test_other_commands_and_broken_input_pass(self):
        self.assertEqual(run_hook("git status", self.repo)[0], 0)
        self.assertEqual(run_hook(f"git worktree remove --force {self.repo}/nope", self.repo)[0], 0)
        r = subprocess.run([sys.executable, SCRIPT], input="not json", capture_output=True, text=True)
        self.assertEqual(r.returncode, 0)


if __name__ == "__main__":
    unittest.main()
