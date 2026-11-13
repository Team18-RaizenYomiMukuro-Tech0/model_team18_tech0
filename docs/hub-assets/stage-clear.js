/* 開発ハブ: 「3 実装②」の Issue がすべて閉じたあと、初めて開いたときだけ出る 4 段の演出（約 6 秒・クリックで飛ばせる）。
   判定は progress-summary.json の phases[]（title が「3 実装②」で closed == total かつ total > 0）。
   見た印は localStorage（読み書きは try/catch。使えなくてもハブは普通に表示する）。 */
(function () {
  "use strict";
  var KEY = "hub-stage3-clear-seen";
  var STEPS = [1600, 1200, 1600, 1600]; // 段 1〜4 の秒数（合計 6.0 秒）
  var CALM_MS = 2600;

  function seen() { try { return window.localStorage.getItem(KEY) === "1"; } catch (e) { return false; } }
  function mark() { try { window.localStorage.setItem(KEY, "1"); } catch (e) { /* 使えなくても続ける */ } }

  function cleared(j) {
    if (!j || !Array.isArray(j.phases)) return false;
    for (var i = 0; i < j.phases.length; i++) {
      var p = j.phases[i];
      if (p && typeof p.title === "string" && /^3\s*実装②/.test(p.title)) {
        return typeof p.closed === "number" && typeof p.total === "number" && p.total > 0 && p.closed === p.total;
      }
    }
    return false;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function shard(cls, x, y, w, h, dx, dy, r, delay) {
    var s = el("i", "sh " + (cls || ""));
    s.style.cssText = "margin-left:" + x + ";margin-top:" + y + ";width:" + w + ";height:" + h +
      ";--dx:" + dx + ";--dy:" + dy + ";--r:" + r + "deg;animation-delay:" + delay + "s";
    return s;
  }
  // 光の翼: 羽根の形の図形を並べるだけ（オリジナル）
  function blade(a, len, w) {
    return '<path d="M0 0 C ' + len * 0.15 + ' ' + -w + ' ' + len * 0.7 + ' ' + -w * 1.1 + ' ' + len + ' ' + -w * 0.1 +
      ' C ' + len * 0.7 + ' ' + w * 0.35 + ' ' + len * 0.25 + ' ' + w * 0.5 + ' 0 0Z" transform="rotate(' + a + ')"/>';
  }
  function wing() {
    var b = [[-58, 300, 22], [-46, 380, 28], [-34, 450, 32], [-22, 520, 36], [-10, 570, 38], [2, 540, 34], [14, 430, 28]];
    return b.map(function (x) { return blade(x[0], x[1], x[2]); }).join("");
  }

  function build(calm) {
    var r = el("div"); r.id = "sc"; r.setAttribute("role", "status");
    r.appendChild(el("span", "vh", "STAGE 3 完了。STAGE 4 評価・受入へ"));
    var p4 = el("div", "plate4"); p4.setAttribute("aria-hidden", "true");
    p4.appendChild(el("span", "", "STAGE 4 ")); p4.appendChild(el("span", "", "評価・受入へ"));
    if (calm) { r.className = "calm"; r.appendChild(p4); return r; }

    var art = el("div"); art.setAttribute("aria-hidden", "true");
    // 段 1
    var s1 = el("div", "ly s1");
    s1.appendChild(el("div", "ly dim")); s1.appendChild(el("div", "ly lines"));
    var pl = el("div", "plate");
    ["a", "b"].forEach(function (k) { var h = el("div", "half " + k); h.appendChild(el("div", "", "STAGE 3")); pl.appendChild(h); });
    s1.appendChild(pl);
    s1.appendChild(shard("", "-3vw", "-6vh", "4.5vw", "4.5vw", "-12vw", "34vh", 140, 0.5));
    s1.appendChild(shard("", "2vw", "-4vh", "5vw", "5vw", "10vw", "40vh", -170, 0.55));
    s1.appendChild(shard("", "-8vw", "-3vh", "3.5vw", "3.5vw", "-22vw", "30vh", 220, 0.6));
    s1.appendChild(shard("", "7vw", "-5vh", "4vw", "4vw", "20vw", "36vh", -120, 0.62));
    s1.appendChild(el("div", "oln gogo", "ゴゴゴ…"));
    // 段 2
    var s2 = el("div", "ly s2");
    s2.appendChild(el("div", "ly dots")); s2.appendChild(el("div", "oln big", "魔族覚醒")); s2.appendChild(el("div", "bar"));
    // 段 3
    var s3 = el("div", "ly s3");
    s3.appendChild(el("div", "ly bg")); s3.appendChild(el("div", "ly lines dk")); s3.appendChild(el("div", "ring"));
    var ds = [[-38, -30, 160], [34, -34, -200], [-42, 20, 240], [40, 24, -150], [-18, -40, 100], [16, 38, -260], [-30, 36, 180], [30, -12, -90]];
    ds.forEach(function (d, i) {
      s3.appendChild(shard(i % 2 ? "k" : "", "-2vw", "-2vw", i % 2 ? "6vw" : "7.5vw", i % 2 ? "6vw" : "7.5vw", d[0] + "vw", d[1] + "vh", d[2], i * 0.03));
    });
    s3.appendChild(el("div", "ly flash"));
    // 段 4
    var s4 = el("div", "ly s4");
    s4.appendChild(el("div", "ly bg")); s4.appendChild(el("div", "ly glow"));
    var wings = document.createElement("div");
    wings.innerHTML = '<svg class="wings" viewBox="0 0 1280 720" aria-hidden="true"><defs><linearGradient id="sc-g" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>' +
      '<g transform="translate(640 360)" fill="url(#sc-g)" stroke="#fff" stroke-width="3"><g class="wr">' + wing() + '</g><g transform="scale(-1 1)"><g class="wl">' + wing() + '</g></g></g>' +
      '<circle cx="640" cy="360" r="62" fill="#fff"/><circle cx="640" cy="360" r="62" fill="none" stroke="#8a8a8a" stroke-width="10"/></svg>';
    s4.appendChild(wings.firstChild); s4.appendChild(p4);
    art.appendChild(s1); art.appendChild(s2); art.appendChild(s3); art.appendChild(s4);
    r.appendChild(art);
    var sk = el("span", "skip", "クリックで飛ばす"); sk.setAttribute("aria-hidden", "true"); r.appendChild(sk);
    return r;
  }

  function play() {
    var calm = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var root = build(calm), timers = [], done = false;
    document.body.appendChild(root);
    document.documentElement.classList.add("sc-lock");
    function end() {
      if (done) return; done = true;
      timers.forEach(clearTimeout);
      document.removeEventListener("keydown", onKey);
      root.classList.remove("on"); root.classList.add("out");
      setTimeout(function () { if (root.parentNode) root.parentNode.removeChild(root); document.documentElement.classList.remove("sc-lock"); }, 400);
    }
    function onKey(e) { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") end(); }
    root.addEventListener("click", end);
    document.addEventListener("keydown", onKey);
    if (calm) {
      requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("on"); }); });
      timers.push(setTimeout(end, CALM_MS));
      return;
    }
    var t = 0;
    STEPS.forEach(function (ms, i) {
      timers.push(setTimeout(function () { root.setAttribute("data-s", String(i + 1)); }, t));
      t += ms;
    });
    timers.push(setTimeout(end, t));
  }

  function start() {
    if (seen() || !window.fetch) return;
    fetch("progress-summary.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { if (!cleared(j) || seen()) return; mark(); play(); })
      .catch(function () { /* 取れなければ何も出さない */ });
  }
  start();
})();
