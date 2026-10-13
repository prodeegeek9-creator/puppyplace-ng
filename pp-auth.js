/* PuppyPlace sign in: a WhatsApp number and a 6-digit code sent to it.
 * window.ppAuth.me()           → the signed-in account, or null
 * window.ppAuth.login({ why }) → opens the sign-in box; resolves with the
 *                                account, or null if it was closed
 */
(function () {
  if (window.ppAuth) return;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var css = '.ppa-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:0}' +
    '@media(min-width:600px){.ppa-bg{align-items:center;padding:16px}}' +
    '.ppa{background:#fff;color:#1a1a18;width:100%;max-width:420px;border-radius:18px 18px 0 0;padding:22px 20px 26px;font-family:Nunito,system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.2);max-height:92vh;overflow-y:auto}' +
    '@media(min-width:600px){.ppa{border-radius:18px}}' +
    '.ppa-h{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.ppa-t{font-size:20px;font-weight:900;margin:0}' +
    '.ppa-x{background:#f1f3f5;border:0;border-radius:50%;width:34px;height:34px;font-size:15px;cursor:pointer;flex-shrink:0;color:#1a1a18}' +
    '.ppa p{color:#6b6b6b;font-size:14px;line-height:1.6;margin:8px 0 0}' +
    '.ppa label{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px;color:#1a1a18}' +
    '.ppa input{width:100%;box-sizing:border-box;border:1.5px solid #e9ecef;border-radius:10px;padding:12px 14px;font:600 16px Nunito,system-ui,sans-serif;color:#0e0e0c;background:#fff;outline:none}' +
    '.ppa input:focus{border-color:#ed6436}' +
    '.ppa-go{width:100%;margin-top:18px;background:#ed6436;color:#fff;border:0;border-radius:50px;padding:14px 22px;font:800 15px Nunito,system-ui,sans-serif;cursor:pointer}' +
    '.ppa-go:disabled{opacity:.6;cursor:wait}.ppa-link{background:none;border:0;color:#ed6436;font:800 13px Nunito,system-ui,sans-serif;cursor:pointer;padding:0}' +
    '.ppa-msg{font-size:13px;font-weight:700;margin-top:12px;line-height:1.5}.ppa-msg.err{color:#d63c2f}.ppa-msg.ok{color:#1e9e57}' +
    '.ppa-small{font-size:12px!important}';

  function api(path, body) {
    return fetch(path, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) { var e = new Error(data.error || 'Something went wrong. Try again.'); e.status = res.status; throw e; }
          return data;
        });
      });
  }

  var cached;
  function me(fresh) {
    if (cached && !fresh) return cached;
    cached = api('/api/me').then(function (d) { return d.account; }, function () { return null; });
    return cached;
  }

  function login(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!document.getElementById('ppa-css')) {
        var st = document.createElement('style'); st.id = 'ppa-css'; st.textContent = css; document.head.appendChild(st);
      }
      var bg = document.createElement('div');
      bg.className = 'ppa-bg';
      bg.innerHTML = '<div class="ppa" role="dialog" aria-modal="true" aria-labelledby="ppa-t"></div>';
      document.body.appendChild(bg);
      var box = bg.firstChild, phone = '', done = false;
      var prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      function close(account) {
        if (done) return; done = true;
        document.body.style.overflow = prevOverflow;
        bg.remove(); document.removeEventListener('keydown', onKey);
        resolve(account || null);
      }
      function onKey(e) { if (e.key === 'Escape') close(null); }
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', function (e) { if (e.target === bg) close(null); });

      function head(title) {
        return '<div class="ppa-h"><h2 class="ppa-t" id="ppa-t">' + esc(title) + '</h2><button class="ppa-x" type="button" aria-label="Close">✕</button></div>';
      }
      function step1() {
        box.innerHTML = head(opts.title || 'Sign in with WhatsApp') +
          '<p>' + esc(opts.why || 'Sign in to contact sellers.') + ' We send a 6-digit code to your WhatsApp. No password, and it takes a few seconds.</p>' +
          '<label for="ppa-ph">Your WhatsApp number</label>' +
          '<input id="ppa-ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="0803 123 4567" value="' + esc(phone) + '"/>' +
          '<button class="ppa-go" type="button">Send me a code</button><div class="ppa-msg"></div>' +
          '<p class="ppa-small">By signing in you agree to our <a href="/terms.html" target="_blank" style="color:#ed6436">terms</a>. We never show your number to sellers unless you chat with them on WhatsApp.</p>';
        wire(function (go, msg) {
          var p = box.querySelector('#ppa-ph').value.trim();
          if (!p) throw new Error('Enter your WhatsApp number.');
          return api('/api/auth/code', { phone: p }).then(function () { phone = p; step2(); });
        }, '#ppa-ph');
      }
      function step2() {
        box.innerHTML = head('Enter your code') +
          '<p>We sent a code to <strong>' + esc(phone) + '</strong> on WhatsApp. <button class="ppa-link" type="button" data-back>Change number</button></p>' +
          '<label for="ppa-code">6-digit code</label>' +
          '<input id="ppa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"/>' +
          '<label for="ppa-name">Your first name <span style="text-transform:none;font-weight:600;color:#6b6b6b">(so sellers know who\'s asking)</span></label>' +
          '<input id="ppa-name" autocomplete="given-name" maxlength="60" placeholder="Ada"/>' +
          '<button class="ppa-go" type="button">Sign in</button><div class="ppa-msg"></div>' +
          '<p class="ppa-small">Didn\'t get it? <button class="ppa-link" type="button" data-again>Send again</button></p>';
        box.querySelector('[data-back]').onclick = step1;
        box.querySelector('[data-again]').onclick = function () {
          var msg = box.querySelector('.ppa-msg');
          api('/api/auth/code', { phone: phone }).then(function () { msg.className = 'ppa-msg ok'; msg.textContent = 'A new code is on its way.'; },
            function (e) { msg.className = 'ppa-msg err'; msg.textContent = e.message; });
        };
        wire(function () {
          var c = box.querySelector('#ppa-code').value.replace(/\D/g, '');
          if (c.length !== 6) throw new Error('Enter the 6-digit code.');
          var name = box.querySelector('#ppa-name').value.trim();
          return api('/api/auth/verify', { phone: phone, code: c, name: name }).then(function (d) {
            cached = Promise.resolve(d.account);
            close(d.account);
          });
        }, '#ppa-code');
      }
      function wire(submit, focus) {
        box.querySelector('.ppa-x').onclick = function () { close(null); };
        var go = box.querySelector('.ppa-go'), msg = box.querySelector('.ppa-msg');
        var run = function () {
          msg.textContent = ''; go.disabled = true;
          var p;
          try { p = Promise.resolve(submit(go, msg)); } catch (e) { p = Promise.reject(e); }
          p.catch(function (e) { if (!done) { msg.className = 'ppa-msg err'; msg.textContent = e.message; go.disabled = false; } });
        };
        go.onclick = run;
        box.querySelectorAll('input').forEach(function (i) { i.onkeydown = function (e) { if (e.key === 'Enter') run(); }; });
        var f = box.querySelector(focus); if (f) f.focus();
      }
      step1();
    });
  }

  function logout() {
    cached = Promise.resolve(null);
    return api('/api/auth/logout', {}).catch(function () {});
  }

  window.ppAuth = { me: me, login: login, logout: logout, api: api, esc: esc };
})();
