/* The message icon's badge: how many conversations have something new.
 * Asks the server only in a browser that has signed in (pp-auth.js and the
 * signed-in pages set "pp_in"), so other visitors cost nothing.
 */
(function () {
  var els = document.querySelectorAll('[data-pp-inbox]');
  if (!els.length) return;
  var signedIn = false;
  try { signedIn = localStorage.getItem('pp_in') === '1'; } catch (e) { /* private mode: no badge */ }
  if (!signedIn) return;
  fetch('/api/dm/unread', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.signedIn === false) { try { localStorage.removeItem('pp_in'); } catch (e) { /* ignore */ } }
      var n = Number(d.count) || 0;
      els.forEach(function (el) {
        el.setAttribute('aria-label', n ? 'Messages, ' + n + ' new' : 'Messages');
        var b = el.querySelector('[data-pp-inbox-count]');
        if (!b) return;
        b.textContent = n > 9 ? '9+' : String(n);
        b.style.display = n ? 'flex' : 'none';
      });
    })
    .catch(function () { /* no badge */ });
})();
