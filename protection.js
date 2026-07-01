(function () {
  const now = Date.now();
  const key = "gaokao_helper_guard";
  const blockKey = "gaokao_helper_block_until";
  const minuteWindow = 60 * 1000;
  const tenMinuteWindow = 10 * minuteWindow;
  const maxLoadsPerMinute = 90;
  const maxLoadsPerTenMinutes = 420;
  const blockDuration = 2 * minuteWindow;

  function readJson(name, fallback) {
    try {
      return JSON.parse(localStorage.getItem(name) || "null") || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(name, value) {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable in private browsing; fail open.
    }
  }

  function block(reason) {
    const until = Date.now() + blockDuration;
    try {
      localStorage.setItem(blockKey, String(until));
    } catch {
      // Ignore storage errors.
    }
    window.__SITE_GUARD_BLOCKED__ = true;
    window.__SITE_GUARD_REASON__ = reason;
  }

  const blockUntil = Number(localStorage.getItem(blockKey) || 0);
  if (blockUntil > now) {
    window.__SITE_GUARD_BLOCKED__ = true;
    window.__SITE_GUARD_REASON__ = "访问过于频繁，请稍后再试。";
  } else if (blockUntil) {
    localStorage.removeItem(blockKey);
  }

  const history = readJson(key, []).filter((time) => now - time < tenMinuteWindow);
  history.push(now);
  writeJson(key, history);

  const loadsLastMinute = history.filter((time) => now - time < minuteWindow).length;
  if (loadsLastMinute > maxLoadsPerMinute || history.length > maxLoadsPerTenMinutes) {
    block("访问过于频繁，页面已临时保护。");
  }

  window.siteGuard = {
    isBlocked() {
      return !!window.__SITE_GUARD_BLOCKED__;
    },
    recordAction() {
      if (this.isBlocked()) return false;
      const actionKey = "gaokao_helper_actions";
      const actionHistory = readJson(actionKey, []).filter((time) => Date.now() - time < minuteWindow);
      actionHistory.push(Date.now());
      writeJson(actionKey, actionHistory);
      if (actionHistory.length > 300) {
        block("操作过于频繁，页面已临时保护。");
        return false;
      }
      return true;
    },
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (window.__SITE_GUARD_BLOCKED__) {
      document.body.classList.add("guard-blocked");
      const panel = document.createElement("div");
      panel.className = "guard-panel";
      panel.innerHTML = "<strong>访问过于频繁</strong><span>请稍后再试。静态页面只能做浏览器本地保护，IP 级限流建议在 CDN/WAF 配置。</span>";
      document.body.appendChild(panel);
    }

    window.setTimeout(() => {
      const fallback = document.querySelector("#statsFallback");
      const pv = document.querySelector("#busuanzi_value_site_pv");
      const uv = document.querySelector("#busuanzi_value_site_uv");
      if (!fallback || !pv || !uv) return;
      fallback.textContent = pv.textContent === "--" && uv.textContent === "--" ? "统计暂不可用" : "公开统计";
    }, 4000);
  });
})();
