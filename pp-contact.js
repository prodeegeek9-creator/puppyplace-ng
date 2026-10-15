/* Pet page contact buttons: [data-pp-contact="whatsapp" | "message"] with data-slug.
 * WhatsApp: sign in (once), then the chat with the seller opens.
 * Message: write it here, sign in on send; the seller is told on WhatsApp.
 * /pets/<slug>?contact=whatsapp (or =message) opens the same on arrival.
 */
(function () {
  var A = window.ppAuth;
  if (!A) return;
  var esc = A.esc;
  var css = '.ppc-bg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9990;display:flex;align-items:flex-end;justify-content:center}' +
    '@media(min-width:600px){.ppc-bg{align-items:center;padding:16px}}' +
    '.ppc{background:#fff;color:#1a1a18;width:100%;max-width:460px;border-radius:18px 18px 0 0;padding:22px 20px 26px;font-family:Nunito,system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.2);max-height:92vh;overflow-y:auto}' +
    '@media(min-width:600px){.ppc{border-radius:18px}}' +
    '.ppc-h{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.ppc-t{font-size:20px;font-weight:900;margin:0}' +
    '.ppc-x{background:#f1f3f5;border:0;border-radius:50%;width:34px;height:34px;font-size:15px;cursor:pointer;flex-shrink:0;color:#1a1a18}' +
    '.ppc p{color:#6b6b6b;font-size:14px;line-height:1.6;margin:8px 0 0}' +
    '.ppc textarea{width:100%;box-sizing:border-box;min-height:120px;margin-top:14px;border:1.5px solid #e9ecef;border-radius:10px;padding:12px 14px;font:600 15px Nunito,system-ui,sans-serif;color:#0e0e0c;resize:vertical;outline:none}' +
    '.ppc textarea:focus{border-color:#ed6436}' +
    '.ppc-warn{background:rgba(243,156,18,.12);color:#8a5a00;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:700;line-height:1.5;margin-top:12px}' +
    '.ppc-go{width:100%;margin-top:16px;background:#ed6436;color:#fff;border:0;border-radius:50px;padding:14px 22px;font:800 15px Nunito,system-ui,sans-serif;cursor:pointer;text-decoration:none;display:block;text-align:center;box-sizing:border-box}' +
    '.ppc-go:disabled{opacity:.6;cursor:wait}.ppc-go.ghost{background:#fff;color:#1a1a18;border:1.5px solid #e9ecef;margin-top:10px}' +
    '.ppc-msg{font-size:13px;font-weight:700;margin-top:12px;line-height:1.5;color:#d63c2f}';

  function toast(text) {
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1a1a18;color:#fff;padding:12px 18px;border-radius:12px;font:700 14px Nunito,system-ui,sans-serif;z-index:10000;max-width:90vw;text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  function chatOnWhatsApp(btn) {
    var slug = btn.getAttribute('data-slug');
    btn.disabled = true;
    var open = function () {
      return A.api('/api/contact?slug=' + encodeURIComponent(slug)).then(function (d) { location.href = d.url; });
    };
    open().catch(function (e) {
      if (e.status !== 401) throw e;
      btn.disabled = false;
      return A.login({ title: 'Chat with the seller', why: 'Sign in to chat with this seller on WhatsApp.' }).then(function (acc) {
        if (!acc) return;
        btn.disabled = true;
        return open();
      });
    }).catch(function (e) { toast(e.message); }).then(function () {
      setTimeout(function () { btn.disabled = false; }, 1500);
    });
  }

  function writeMessage(btn) {
    var slug = btn.getAttribute('data-slug'), breed = btn.getAttribute('data-breed') || 'pet';
    if (!document.getElementById('ppc-css')) {
      var st = document.createElement('style'); st.id = 'ppc-css'; st.textContent = css; document.head.appendChild(st);
    }
    var bg = document.createElement('div');
    bg.className = 'ppc-bg';
    bg.innerHTML = '<div class="ppc" role="dialog" aria-modal="true" aria-labelledby="ppc-t">' +
      '<div class="ppc-h"><h2 class="ppc-t" id="ppc-t">Message the seller</h2><button class="ppc-x" type="button" aria-label="Close">✕</button></div>' +
      '<p>About the <strong>' + esc(breed) + '</strong>. The seller gets your message on WhatsApp and replies here. Neither of you sees the other\'s number.</p>' +
      '<textarea maxlength="1000" aria-label="Your message">Hi, is the ' + esc(breed) + ' still available? </textarea>' +
      '<div class="ppc-warn">🛡️ Never pay a deposit or transfer money before you\'ve seen the pet in person.</div>' +
      '<button class="ppc-go" type="button">Send message</button><div class="ppc-msg"></div></div>';
    document.body.appendChild(bg);
    var prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var box = bg.firstChild, ta = box.querySelector('textarea'), go = box.querySelector('.ppc-go'), msg = box.querySelector('.ppc-msg');
    var close = function () { document.body.style.overflow = prev; bg.remove(); };
    box.querySelector('.ppc-x').onclick = close;
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);

    var send = function () {
      var text = ta.value.trim();
      if (!text) { msg.textContent = 'Write a message first.'; return; }
      msg.textContent = ''; go.disabled = true;
      A.api('/api/dm/send', { slug: slug, body: text }).catch(function (e) {
        if (e.status !== 401) throw e;
        bg.style.display = 'none';
        return A.login({ title: 'Send your message', why: 'Sign in so the seller can reply to you.' }).then(function (acc) {
          bg.style.display = '';
          if (!acc) { go.disabled = false; return null; }
          return A.api('/api/dm/send', { slug: slug, body: text });
        });
      }).then(function (d) {
        if (!d) return;
        box.innerHTML = '<div class="ppc-h"><h2 class="ppc-t">Message sent ✅</h2><button class="ppc-x" type="button" aria-label="Close">✕</button></div>' +
          '<p>The seller has been told on WhatsApp. When they reply, we\'ll send you a WhatsApp message with a link to the conversation.</p>' +
          (d.warn ? '<div class="ppc-warn">Your message mentions payment. Only pay after you\'ve seen the pet and are happy with it.</div>' : '') +
          '<a class="ppc-go" href="/messages.html?t=' + encodeURIComponent(d.thread_id) + '">Open the conversation</a>' +
          '<button class="ppc-go ghost" type="button" data-close>Keep browsing</button>';
        box.querySelector('.ppc-x').onclick = close;
        box.querySelector('[data-close]').onclick = close;
      }).catch(function (e) { msg.textContent = e.message; go.disabled = false; });
    };
    go.onclick = send;
  }

  document.addEventListener('click', function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-pp-contact]');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    if (btn.getAttribute('data-pp-contact') === 'whatsapp') chatOnWhatsApp(btn);
    else writeMessage(btn);
  });

  // Arriving from a "Contact" button elsewhere on the site.
  var q = new URLSearchParams(location.search).get('contact');
  if (q === 'whatsapp' || q === 'message') {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* the address keeps the flag */ }
    var b = document.querySelector('[data-pp-contact="' + q + '"]');
    if (b) b.click();
  }
})();
