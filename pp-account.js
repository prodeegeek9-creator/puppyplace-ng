/* The account button in every page's header ([data-pp-account]).
 *
 * A visitor sees "Sign in", and signs in with a code sent to their WhatsApp
 * (pp-auth.js, loaded on the first tap). Once signed in the button shows their
 * first name and opens a menu: My listings, Messages, List a pet, Shop orders,
 * Log out. On a pet's page, its seller also sees a bar to edit the listing or
 * mark it sold ([data-pp-owner-bar data-slug]).
 *
 * Only a browser that has signed in asks the server anything ("pp_in", set by
 * pp-auth.js and the signed-in pages), so other visitors cost nothing.
 */
(function () {
  if (window.ppAccount) return;
  var mounts = [].slice.call(document.querySelectorAll('[data-pp-account]'));
  var ownerBar = document.querySelector('[data-pp-owner-bar]');
  if (!mounts.length && !ownerBar) return;

  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var css =
    '.pp-acct-btn{display:inline-flex;align-items:center;gap:6px;background:none;border:1.5px solid #e9ecef;border-radius:50px;padding:7px 14px;font:800 13px Nunito,system-ui,sans-serif;color:inherit;cursor:pointer;white-space:nowrap}' +
    '.pp-acct-btn:hover{border-color:#ed6436;color:#ed6436}' +
    // Only clears the browser's button look: the page's own .nav-ico and .mob-ico rules come first.
    ':where(button.nav-ico[data-pp-account],button.mob-ico[data-pp-account]){background:none;border:0;color:inherit;cursor:pointer;font:inherit;padding:0;position:relative}' +
    '[data-pp-account].pp-in.nav-ico::after,[data-pp-account].pp-in.mob-ico::after{content:"";position:absolute;right:2px;bottom:2px;width:8px;height:8px;border-radius:50%;background:#22c35e;box-shadow:0 0 0 2px #fff}' +
    '.ppm{position:absolute;z-index:9998;background:#fff;color:#1a1a18;border:1px solid #e9ecef;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.16);min-width:230px;padding:8px;font-family:Nunito,system-ui,sans-serif}' +
    '.ppm-who{padding:10px 12px 12px;border-bottom:1px solid #f1f3f5;margin-bottom:6px}' +
    '.ppm-who b{display:block;font-size:15px;font-weight:900}.ppm-who span{font-size:12px;color:#6b6b6b}' +
    '.ppm a,.ppm button{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:10px 12px;border:0;background:none;border-radius:10px;font:700 14px Nunito,system-ui,sans-serif;color:#1a1a18;text-decoration:none;cursor:pointer;text-align:left}' +
    '.ppm a:hover,.ppm button:hover{background:#fdf1ec;color:#ed6436}' +
    '.ppm .ppm-n{margin-left:auto;font-size:11px;font-weight:800;color:#6b6b6b}' +
    '.pp-owner{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:#fdf1ec;border:1px solid #f8d3c4;border-radius:12px;padding:12px 16px;margin:0 0 16px;font:700 14px Nunito,system-ui,sans-serif;color:#1a1a18}' +
    '.pp-owner b{margin-right:auto}' +
    '.pp-owner a{background:#ed6436;color:#fff;border-radius:50px;padding:8px 16px;font-weight:800;font-size:13px;text-decoration:none}' +
    '.pp-owner a.ghost{background:#fff;color:#ed6436;border:1.5px solid #ed6436}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var state = null; // { account: { name, phone }, listings: [{ id, slug, active, sold_at, listing_type }] }

  function flag(on) { try { on ? localStorage.setItem('pp_in', '1') : localStorage.removeItem('pp_in'); } catch (e) { /* private mode */ } }
  function wasIn() { try { return localStorage.getItem('pp_in') === '1'; } catch (e) { return false; } }
  function firstName(a) { return a && a.name ? String(a.name).split(' ')[0] : 'My account'; }

  function load() {
    return fetch('/api/me?brief=1', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { state = d && d.account ? d : null; flag(!!state); paint(); return state; })
      .catch(function () { paint(); return null; });
  }

  function paint() {
    mounts.forEach(function (el) {
      var label = el.querySelector('[data-pp-account-label]');
      if (label) label.textContent = state ? firstName(state.account) : 'Sign in';
      el.setAttribute('aria-label', state ? 'Your account: ' + firstName(state.account) : 'Sign in');
      el.setAttribute('aria-haspopup', state ? 'menu' : 'dialog');
      el.title = state ? 'Your listings and messages' : 'Sign in with WhatsApp';
      el.classList.toggle('pp-in', !!state);
    });
    paintOwner();
  }

  // On a pet's page: the seller of this pet can change it from here.
  function paintOwner() {
    if (!ownerBar) return;
    var slug = ownerBar.getAttribute('data-slug');
    var mine = state && (state.listings || []).find(function (p) { return p.slug === slug; });
    if (!mine) { ownerBar.hidden = true; ownerBar.innerHTML = ''; return; }
    var id = encodeURIComponent(mine.id);
    var word = mine.listing_type === 'adoption' ? 'adopted' : 'sold';
    ownerBar.className = 'pp-owner';
    ownerBar.innerHTML = '<b>🐾 This is your listing.</b>' +
      (mine.sold_at
        ? '<a class="ghost" href="/my-listings.html#available-' + id + '">Mark as available again</a>'
        : '<a href="/my-listings.html#sold-' + id + '">Mark as ' + word + '</a><a class="ghost" href="/my-listings.html#edit-' + id + '">Edit listing</a>');
    ownerBar.hidden = false;
  }

  function auth() {
    if (window.ppAuth) return Promise.resolve(window.ppAuth);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/pp-auth.js';
      s.onload = function () { resolve(window.ppAuth); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function signIn(anchor) {
    auth()
      .then(function (a) { return a.login({ title: 'Sign in to PuppyPlace', why: 'Sign in with your WhatsApp number to see and change your listings and read your messages.' }); })
      .then(function (account) { if (account) return load().then(function () { if (state && anchor) openMenu(anchor); }); })
      .catch(function () { location.href = '/my-listings.html'; });
  }

  var menu = null;
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('click', onOutside, true);
    document.removeEventListener('keydown', onKey);
  }
  function onOutside(e) { if (menu && !menu.contains(e.target) && !e.target.closest('[data-pp-account]')) closeMenu(); }
  function onKey(e) { if (e.key === 'Escape') closeMenu(); }

  function openMenu(anchor) {
    closeMenu();
    var a = state.account;
    var listings = (state.listings || []).filter(function (p) { return p.active !== false && !p.sold_at; }).length;
    menu = document.createElement('div');
    menu.className = 'ppm';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<div class="ppm-who"><b>' + esc(a.name || 'Your account') + '</b><span>+' + esc(a.phone) + '</span></div>' +
      '<a role="menuitem" href="/my-listings.html">🐶 My listings' + ((state.listings || []).length ? '<span class="ppm-n">' + listings + ' live</span>' : '') + '</a>' +
      '<a role="menuitem" href="/messages.html">💬 Messages</a>' +
      '<a role="menuitem" href="/sell-my-dog.html">➕ List a pet</a>' +
      '<a role="menuitem" href="/account.html">🛍️ Shop orders and account</a>' +
      '<button role="menuitem" type="button" data-out>↩️ Log out</button>';
    document.body.appendChild(menu);
    var r = anchor.getBoundingClientRect();
    var w = menu.offsetWidth;
    var left = Math.min(Math.max(8, r.right - w), document.documentElement.clientWidth - w - 8);
    menu.style.left = (left + window.scrollX) + 'px';
    menu.style.top = (r.bottom + window.scrollY + 8) + 'px';
    menu.querySelector('[data-out]').onclick = function () {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(function () {}).then(function () {
        flag(false); state = null; closeMenu(); paint();
        if (/\/(my-listings|messages)\.html/.test(location.pathname)) location.reload();
      });
    };
    setTimeout(function () {
      document.addEventListener('click', onOutside, true);
      document.addEventListener('keydown', onKey);
    }, 0);
  }

  mounts.forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (state) { menu ? closeMenu() : openMenu(el); } else signIn(el);
    });
  });

  paint();
  if (wasIn()) load();
  window.ppAccount = { refresh: load };
})();
