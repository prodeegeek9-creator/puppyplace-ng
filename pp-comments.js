/* Comments under a blog post: <section id="comments" data-slug="…">.
 * Anyone can read them. To write one, a reader signs in (a WhatsApp number and a
 * code, the same as for buyers); only their first name is shown, never the number.
 * A comment with a link, an email address, a phone number or payment words waits
 * for the PuppyPlace team before it shows. Replies from the team are marked.
 * Everything a reader wrote is put on the page as text, never as markup.
 */
(function () {
  var root = document.getElementById('comments');
  if (!root) return;
  var slug = root.getAttribute('data-slug');
  var A = window.ppAuth;
  var comments = [];

  var css = '.ppcm{max-width:760px;margin:0 auto;padding:8px 24px 48px;font-family:Nunito,system-ui,sans-serif;color:#1a1a18}' +
    '.ppcm h2{font-size:22px;font-weight:900;margin:0 0 6px}.ppcm .ppcm-sub{font-size:14px;color:#6b6b6b;margin:0 0 20px;line-height:1.6}' +
    '.ppcm-list{display:flex;flex-direction:column;gap:14px;margin:0 0 24px;padding:0;list-style:none}' +
    '.ppcm-item{background:#fff;border:1.5px solid #e9ecef;border-radius:14px;padding:14px 16px}' +
    '.ppcm-item.team{border-color:#ed6436;background:#fff8f4}' +
    '.ppcm-reply{margin:10px 0 0 18px;border-left:3px solid #f1d6c9;padding-left:12px}' +
    '.ppcm-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}' +
    '.ppcm-name{font-weight:900}.ppcm-time{color:#8a8a85}.ppcm-badge{background:#ed6436;color:#fff;border-radius:50px;padding:2px 9px;font-size:11px;font-weight:800}' +
    '.ppcm-body{font-size:15px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;margin:0}' +
    '.ppcm-empty{color:#6b6b6b;font-size:15px;margin:0 0 20px}' +
    '.ppcm form{background:#f8f9fa;border-radius:14px;padding:16px}' +
    '.ppcm label{display:block;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px}' +
    '.ppcm textarea{width:100%;box-sizing:border-box;min-height:100px;border:1.5px solid #e9ecef;border-radius:10px;padding:12px 14px;font:600 15px Nunito,system-ui,sans-serif;color:#0e0e0c;background:#fff;resize:vertical;outline:none}' +
    '.ppcm textarea:focus{border-color:#ed6436}' +
    '.ppcm-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}' +
    '.ppcm-go{background:#ed6436;color:#fff;border:0;border-radius:50px;padding:12px 24px;font:800 15px Nunito,system-ui,sans-serif;cursor:pointer}.ppcm-go:disabled{opacity:.6;cursor:wait}' +
    '.ppcm-count{font-size:12px;color:#8a8a85}' +
    '.ppcm-msg{font-size:13px;font-weight:700;margin-top:10px;line-height:1.5}.ppcm-msg.err{color:#d63c2f}.ppcm-msg.ok{color:#1e9e57}' +
    '@media(max-width:600px){.ppcm{padding:8px 20px 40px}}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ago(iso) {
    var ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 0) return '';
    var m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.floor(h / 24);
    if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function item(c, reply) {
    var li = el('li', 'ppcm-item' + (c.team ? ' team' : '') + (reply ? ' ppcm-reply' : ''));
    li.id = 'comment-' + c.id;
    var head = el('div', 'ppcm-head');
    head.appendChild(el('span', 'ppcm-name', c.name || 'A reader'));
    if (c.team) head.appendChild(el('span', 'ppcm-badge', 'PuppyPlace team'));
    head.appendChild(el('span', 'ppcm-time', ago(c.at)));
    li.appendChild(head);
    li.appendChild(el('p', 'ppcm-body', c.body));
    return li;
  }

  var heading, listBox, say, ta, go, counter;

  function renderList() {
    var tops = comments.filter(function (c) { return !c.parent_id; });
    heading.textContent = '💬 Comments' + (comments.length ? ' (' + comments.length + ')' : '');
    listBox.textContent = '';
    if (!tops.length) { listBox.appendChild(el('p', 'ppcm-empty', 'No comments yet. Be the first to share what you think.')); return; }
    var ul = el('ul', 'ppcm-list');
    tops.forEach(function (c) {
      var li = item(c, false);
      comments.filter(function (r) { return r.parent_id === c.id; }).forEach(function (r) { li.appendChild(item(r, true)); });
      ul.appendChild(li);
    });
    listBox.appendChild(ul);
  }

  function setMsg(text, kind) { say.textContent = text || ''; say.className = 'ppcm-msg' + (kind ? ' ' + kind : ''); }

  function submit(e) {
    e.preventDefault();
    var text = ta.value.trim();
    if (text.length < 2) { setMsg('Write a comment first.', 'err'); return; }
    if (!A) { setMsg('Reload the page and try again.', 'err'); return; }
    go.disabled = true; setMsg('');
    var send = function () { return A.api('/api/blog-comments', { slug: slug, body: text }); };
    send().catch(function (err) {
      if (err.status !== 401) throw err;
      return A.login({ title: 'Join the conversation', why: 'Sign in with your WhatsApp number to comment. We only show your first name, never your number.' }).then(function (acc) {
        return acc ? send() : null;
      });
    }).then(function (d) {
      if (!d) return;
      ta.value = ''; counter.textContent = '0 / 1000';
      if (d.held) { setMsg('Thanks! Your comment will show once the team has had a quick look at it.', 'ok'); return; }
      comments.push(d.comment);
      renderList();
      setMsg('Your comment is up. Thank you! ✓', 'ok');
    }).catch(function (err) { setMsg(err.message || 'Something went wrong. Try again.', 'err'); })
      .then(function () { go.disabled = false; });
  }

  function build() {
    if (!document.getElementById('ppcm-css')) {
      var st = el('style'); st.id = 'ppcm-css'; st.textContent = css; document.head.appendChild(st);
    }
    root.textContent = '';
    var box = el('div', 'ppcm');
    heading = el('h2');
    box.appendChild(heading);
    box.appendChild(el('p', 'ppcm-sub', 'Questions or tips from your own experience are welcome. Please be kind, and never share a phone number or a bank detail here.'));
    listBox = el('div');
    box.appendChild(listBox);

    var form = el('form');
    form.setAttribute('novalidate', '');
    var label = el('label', null, 'Add a comment'); label.setAttribute('for', 'ppcm-text');
    ta = el('textarea'); ta.id = 'ppcm-text'; ta.maxLength = 1000; ta.placeholder = 'Share your thoughts or ask a question…';
    counter = el('span', 'ppcm-count', '0 / 1000');
    ta.addEventListener('input', function () { counter.textContent = ta.value.length + ' / 1000'; });
    go = el('button', 'ppcm-go', 'Post comment'); go.type = 'submit';
    var row = el('div', 'ppcm-row'); row.appendChild(counter); row.appendChild(go);
    say = el('div', 'ppcm-msg'); say.setAttribute('aria-live', 'polite');
    form.appendChild(label); form.appendChild(ta); form.appendChild(row); form.appendChild(say);
    form.addEventListener('submit', submit);
    box.appendChild(form);
    root.appendChild(box);
    renderList();
  }

  fetch('/api/blog-comments?slug=' + encodeURIComponent(slug), { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || d.ready === false) return; // comments are not set up: show nothing
      comments = d.comments || [];
      build();
      if (location.hash.indexOf('#comment-') === 0) {
        var target = document.getElementById(location.hash.slice(1));
        if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
      }
    })
    .catch(function () { /* a page without comments is still a page */ });
})();
