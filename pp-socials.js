/* PuppyPlace's social accounts: the footer icons and the "follow us" popup.
 *
 * SOCIALS is the one list. To switch an account off for a while (shown greyed
 * out, not clickable, "coming back soon"), set off: true; remove it to switch
 * it back on. A network with an empty url is left out. (worker.js →
 * PET_FOOTER_SOCIALS is the copy the WhatsApp assistant gets; keep its off
 * flags the same.)
 *
 * Footers: any element with data-pp-socials is filled with the icons.
 *   data-class="fsoc"  gives each icon that class (to use the page's own style)
 *   data-size="15"     icon size in px (default 16)
 * Without data-class, the icons get the .pp-soc style below.
 *
 * Popup, shown when a visitor is about to leave. Desktop: when the pointer
 * leaves the top of the window (towards the tabs, the address bar or the close
 * button). Phones have no pointer, so there it shows when the visitor scrolls
 * back up quickly after reading at least half the page, or after 45 seconds.
 * Never in the first 8 seconds, never while they are typing or another dialog
 * is open, at most once a session and once every FOLLOW_EVERY_DAYS, and not
 * again for a year once they have tapped one of the links.
 *
 * Loaded by pp-account.js, which every public page includes (or directly).
 */
(function () {
  if (window.ppSocialsLoaded) return;
  window.ppSocialsLoaded = true;

  var SOCIALS = [
    { name: 'Facebook', handle: 'thepuppyplace.ng', url: 'https://www.facebook.com/thepuppyplace.ng', color: '#1877f2',
      icon: '<path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V9c0-.6.4-1 1-1Z" fill="currentColor"/>' },
    { name: 'Instagram', handle: '@puppyplace_ng', url: 'https://www.instagram.com/puppyplace_ng', color: '#d62976', off: true,
      icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>' },
    { name: 'TikTok', handle: '@puppyplace.ng', url: 'https://www.tiktok.com/@puppyplace.ng', color: '#111111',
      icon: '<path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.1-2.8V9.1a6.4 6.4 0 1 0 5.5 6.3V8.6a8 8 0 0 0 4.4 1.3V6.5a4.5 4.5 0 0 1-4.4-4.5Z" fill="currentColor"/>' },
    { name: 'X', handle: '@puppyplaceng', url: 'https://x.com/puppyplaceng', color: '#000000',
      icon: '<path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.9L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" fill="currentColor"/>' },
  ].filter(function (s) { return s.url; });
  window.ppSocials = SOCIALS;
  if (!SOCIALS.length) return;

  var svg = function (s, size) { return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + s.icon + '</svg>'; };

  /* ── Footers ── */
  var footerCss =
    '.pp-soc{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}' +
    '.pp-soc.pp-soc-center{justify-content:center;margin:14px 0 6px}' +
    '.pp-soc a{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,.18);color:rgba(255,255,255,.75);padding:0;margin:0;text-decoration:none}' +
    '.pp-soc a:hover{color:#ed6436;border-color:#ed6436}' +
    // Switched off: greyed, no hover, no click.
    '[data-pp-socials] .pp-soc-off{opacity:.3;filter:grayscale(1);pointer-events:none;cursor:default}';
  function renderFooters() {
    var els = document.querySelectorAll('[data-pp-socials]');
    if (!els.length) return;
    if (!document.getElementById('pp-soc-css')) {
      var st = document.createElement('style');
      st.id = 'pp-soc-css';
      st.textContent = footerCss;
      document.head.appendChild(st);
    }
    [].forEach.call(els, function (el) {
      var cls = el.getAttribute('data-class') || '';
      var size = Number(el.getAttribute('data-size')) || 16;
      if (!cls) el.classList.add('pp-soc');
      el.innerHTML = SOCIALS.map(function (s) {
        return s.off
          ? '<a class="' + cls + ' pp-soc-off" aria-disabled="true" aria-label="' + s.name + ' (coming back soon)" title="' + s.name + ' is coming back soon">' + svg(s, size) + '</a>'
          : '<a class="' + cls + '" href="' + s.url + '" target="_blank" rel="noopener me" aria-label="' + s.name + '">' + svg(s, size) + '</a>';
      }).join('');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderFooters);
  else renderFooters();

  /* ── "Follow us" popup ── */
  var FOLLOW_EVERY_DAYS = 7;
  var FOLLOWED_DAYS = 365;
  var MIN_SECONDS = 8;
  var PHONE_SECONDS = 45;
  var KEY = 'pp_follow';

  var get = function (store, k) { try { return window[store].getItem(k); } catch (e) { return null; } };
  var set = function (store, k, v) { try { window[store].setItem(k, v); } catch (e) { /* private mode */ } };

  var until = Number(get('localStorage', KEY)) || 0;
  if (Date.now() < until || get('sessionStorage', KEY)) return;

  var started = Date.now();
  var shown = false;

  function busy() {
    var a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
    var dialogs = document.querySelectorAll('[aria-modal="true"], dialog[open]');
    for (var i = 0; i < dialogs.length; i++) if (dialogs[i].offsetParent !== null || dialogs[i].open) return true;
    return false;
  }

  function show() {
    if (shown || Date.now() - started < MIN_SECONDS * 1000 || busy()) return;
    shown = true;
    set('sessionStorage', KEY, '1');
    set('localStorage', KEY, String(Date.now() + FOLLOW_EVERY_DAYS * 864e5));
    stop();

    var css =
      '.ppf-bg{position:fixed;inset:0;z-index:10000;background:rgba(20,20,18,.55);display:flex;align-items:center;justify-content:center;padding:16px;animation:ppf-in .18s ease-out}' +
      '.ppf:focus{outline:none}.ppf{position:relative;width:100%;max-width:380px;background:#fff;color:#1a1a18;border-radius:20px;padding:28px 22px 18px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:Nunito,system-ui,sans-serif;text-align:center;box-sizing:border-box}' +
      '.ppf h2{margin:6px 0 6px;font-size:22px;font-weight:900;line-height:1.2}' +
      '.ppf p{margin:0 0 18px;font-size:14.5px;color:#555;line-height:1.5}' +
      '.ppf-paw{font-size:34px;line-height:1}' +
      '.ppf-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border:0;border-radius:50%;background:#f1f3f5;color:#1a1a18;font-size:16px;cursor:pointer}' +
      '.ppf-list{display:grid;gap:10px}' +
      '.ppf-list a,.ppf-off{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;border:1.5px solid #e9ecef;text-decoration:none;color:#1a1a18;font-weight:800;font-size:15px;text-align:left}' +
      '.ppf-list a:hover,.ppf-list a:focus-visible{border-color:#ed6436;background:#fdf1ec}' +
      '.ppf-list i{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;color:#fff;flex-shrink:0}' +
      '.ppf-list small{display:block;font-weight:700;font-size:12px;color:#6b6b6b}' +
      '.ppf-list b{margin-left:auto;font-size:12.5px;color:#ed6436;font-weight:900}' +
      '.ppf-off{opacity:.45;filter:grayscale(1)}.ppf-off b{color:#6b6b6b}' +
      '.ppf-later{margin-top:12px;background:none;border:0;color:#6b6b6b;font:700 13px Nunito,system-ui,sans-serif;cursor:pointer;padding:8px}' +
      '@keyframes ppf-in{from{opacity:0}to{opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){.ppf-bg{animation:none}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var bg = document.createElement('div');
    bg.className = 'ppf-bg';
    bg.innerHTML =
      '<div class="ppf" role="dialog" aria-modal="true" aria-labelledby="ppf-h" tabindex="-1">' +
        '<button type="button" class="ppf-x" aria-label="Close">✕</button>' +
        '<div class="ppf-paw" aria-hidden="true">🐾</div>' +
        '<h2 id="ppf-h">Before you go…</h2>' +
        '<p>Follow PuppyPlace for new puppies and pets as they’re listed, pet care tips and giveaways.</p>' +
        '<div class="ppf-list">' +
          SOCIALS.map(function (s) {
            var inner = '<i style="background:' + s.color + '">' + svg(s, 18) + '</i>' +
              '<span>' + s.name + (s.handle ? '<small>' + s.handle + '</small>' : '') + '</span>';
            return s.off
              ? '<div class="ppf-off" aria-disabled="true">' + inner + '<b>Coming back soon</b></div>'
              : '<a href="' + s.url + '" target="_blank" rel="noopener">' + inner + '<b>Follow</b></a>';
          }).join('') +
        '</div>' +
        '<button type="button" class="ppf-later">Maybe later</button>' +
      '</div>';
    document.body.appendChild(bg);

    var before = document.activeElement;
    function close() {
      bg.remove();
      document.removeEventListener('keydown', onKey);
      if (before && before.focus) try { before.focus(); } catch (e) { /* gone */ }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    bg.querySelector('.ppf-x').onclick = close;
    bg.querySelector('.ppf-later').onclick = close;
    [].forEach.call(bg.querySelectorAll('.ppf-list a'), function (a) {
      a.addEventListener('click', function () {
        set('localStorage', KEY, String(Date.now() + FOLLOWED_DAYS * 864e5));
        setTimeout(close, 300);
      });
    });
    bg.querySelector('.ppf').focus({ preventScroll: true });
  }

  // Desktop: the pointer leaves through the top of the window.
  function onOut(e) {
    if (!e.relatedTarget && e.clientY <= 0) show();
  }

  // Phones: a quick scroll back up after reading half the page, or time on the page.
  var lastY = window.scrollY, lastT = Date.now(), deepest = 0, timer = null;
  function onScroll() {
    var y = window.scrollY, t = Date.now();
    var room = document.documentElement.scrollHeight - window.innerHeight;
    if (room > 0) deepest = Math.max(deepest, y / room);
    var speed = (lastY - y) / Math.max(1, t - lastT); // px per ms, upwards
    if (deepest >= 0.5 && speed > 1.5 && lastY - y > 120) show();
    lastY = y; lastT = t;
  }

  var finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
  function stop() {
    document.removeEventListener('mouseout', onOut);
    window.removeEventListener('scroll', onScroll);
    if (timer) clearTimeout(timer);
  }
  if (finePointer) {
    document.addEventListener('mouseout', onOut);
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
    timer = setTimeout(function retry() { show(); if (!shown) timer = setTimeout(retry, 10000); }, PHONE_SECONDS * 1000);
  }
})();
