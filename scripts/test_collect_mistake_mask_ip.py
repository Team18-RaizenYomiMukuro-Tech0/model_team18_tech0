import importlib.util
import os
import unittest

D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cm", os.path.join(D, "collect-mistake.py"))
cm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cm)


class T(unittest.TestCase):
    def test_masks_public_ip(self):
        self.assertEqual(cm.mask("connect to 203.0.113.5 failed"), "connect to <ip> failed")
        self.assertEqual(cm.mask("ssh 198.51.100.7:3306"), "ssh <ip>:3306")
        self.assertEqual(cm.mask("a 255.255.255.255 b 10.0.0.1"), "a <ip> b <ip>")

    def test_keeps_local(self):
        self.assertEqual(cm.mask("127.0.0.1:8000 0.0.0.0:80"), "127.0.0.1:8000 0.0.0.0:80")

    def test_keeps_version_and_date(self):
        for t in ("v1.2.3", "python 3.11.4", "2026.11.26", "2026-11-26", "1.2.3.4.5", "256.1.1.1", "1.2.3"):
            self.assertEqual(cm.mask(t), t)



class Noise(unittest.TestCase):
    def test_exit1_without_error_text_is_noise(self):
        self.assertTrue(cm.is_noise(None, "Exit code 1"))
        self.assertTrue(cm.is_noise(None, "Exit code 1\nfoo.md:3: hello\n"))
        self.assertTrue(cm.is_noise(1, ""))

    def test_real_failures_are_kept(self):
        self.assertFalse(cm.is_noise(None, "Exit code 1\nls: cannot access 'x': No such file or directory"))
        self.assertFalse(cm.is_noise(None, "Exit code 1\nTraceback (most recent call last):"))
        self.assertFalse(cm.is_noise(None, "Exit code 2\n"))
        self.assertFalse(cm.is_noise(None, "Exit code 127\nbash: az: command not found"))
        self.assertFalse(cm.is_noise(None, "Exit code 1\ngit: 'nope' is not a git command. See 'git --help'."))
        self.assertFalse(cm.is_noise(None, "something broke"))  # 終了コードが分からない


if __name__ == "__main__":
    unittest.main()
