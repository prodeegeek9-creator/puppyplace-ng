export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/config.js') {
      const config = {
        SUPABASE_URL:        env.SUPABASE_URL        || '',
        SUPABASE_ANON:       env.SUPABASE_ANON       || '',
        PAYSTACK_PUBLIC_KEY: env.PAYSTACK_PUBLIC_KEY || '',
        N8N_WEBHOOK_URL:     env.N8N_WEBHOOK_URL     || '',
      };
      return new Response(`window.PPCONFIG = ${JSON.stringify(config)};`, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      });
    }

    // Hero image upload proxy — uses service key server-side so RLS is bypassed
    if (url.pathname === '/api/hero-upload' && request.method === 'POST') {
      return handleHeroUpload(request, env);
    }

    if (url.pathname === '/api/update-profile' && request.method === 'POST') {
      return handleUpdateProfile(request, env);
    }

    if (url.pathname === '/api/admin-login' && request.method === 'POST') {
      return handleAdminLogin(request, env);
    }

    if (url.pathname === '/api/admin-verify' && request.method === 'POST') {
      return handleAdminVerify(request, env);
    }

    if (url.pathname === '/sitemap.xml') {
      return serveSitemap(env);
    }

    // Image proxy for OG tags — re-serves Supabase images through Cloudflare
    // so social crawlers (WhatsApp etc.) hit a fast, trusted origin with clean headers
    if (url.pathname === '/api/og-img') {
      return handleOgImageProxy(request, url, env);
    }

    const postMatch = url.pathname.match(/^\/posts\/([^/]+?)(?:\.html)?$/);
    if (postMatch) {
      return servePost(decodeURIComponent(postMatch[1]), env);
    }

    const productMatch = url.pathname.match(/^\/product\/(.+?)(?:\.html)?$/);
    if (productMatch) {
      return serveProduct(decodeURIComponent(productMatch[1]), env);
    }

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    return env.ASSETS.fetch(request);
  },
};

// Returns headers using the service key when available, anon key as fallback
function sbHeaders(env) {
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON;
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
  };
}

async function handleHeroUpload(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResp({ error: 'Server not configured' }, 503);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResp({ error: 'Invalid form data' }, 400);
  }

  const file   = formData.get('file');
  const bucket = formData.get('bucket') || 'hero-images';

  if (!file || typeof file === 'string') {
    return jsonResp({ error: 'No file provided' }, 400);
  }

  const ALLOWED = ['image/jpeg','image/png','image/webp','image/gif','image/avif'];
  if (!ALLOWED.includes(file.type)) {
    return jsonResp({ error: 'Only image files are allowed' }, 400);
  }
  if (file.size > 5 * 1024 * 1024) {
    return jsonResp({ error: 'File too large — max 5 MB' }, 400);
  }

  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `upload-${Date.now()}.${ext}`;
  const key  = env.SUPABASE_SERVICE_KEY;

  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method:  'POST',
      headers: {
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Content-Type':  file.type,
        'x-upsert':      'true',
      },
      body: file.stream(),
      // Cloudflare Workers requires duplex for streaming uploads
      duplex: 'half',
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return jsonResp({ error: 'Storage upload failed: ' + err }, 500);
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  return jsonResp({ url: publicUrl }, 200);
}

function jsonResp(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handleOgImageProxy(request, url, env) {
  const imgUrl = url.searchParams.get('url');
  const supabaseHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).host : null;
  if (!imgUrl || !supabaseHost || !imgUrl.startsWith(`https://${supabaseHost}/storage/`)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Route through wsrv.nl to resize/compress on the fly — works on any Supabase plan.
  // Resizes to max 1200px wide, converts to JPEG at q=82, falls back to original.
  const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(imgUrl)}&w=1200&output=jpg&q=82&we`;

  let upstream;
  try {
    const res = await fetch(wsrvUrl);
    upstream = res.ok ? res : await fetch(imgUrl);
  } catch (_) {
    try { upstream = await fetch(imgUrl); } catch (_) { return new Response('Proxy error', { status: 502 }); }
  }

  if (!upstream.ok) return new Response('Not found', { status: 404 });

  // Buffer fully so we can set Content-Length — WhatsApp drops images served
  // without Content-Length (streaming response with unknown size)
  const imageData = await upstream.arrayBuffer();
  const ct = upstream.headers.get('Content-Type') || 'image/jpeg';

  return new Response(imageData, {
    headers: {
      'Content-Type':                ct,
      'Content-Length':              String(imageData.byteLength),
      'Cache-Control':               'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options':      'nosniff',
    },
  });
}

async function servePost(slug, env) {
  if (!env.SUPABASE_URL) {
    return html(errorPage('Server not configured.'), 503);
  }

  const headers = sbHeaders(env);
  let post, related;
  try {
    const [postRes, relRes] = await Promise.all([
      fetch(
        `${env.SUPABASE_URL}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=*`,
        { headers }
      ),
      fetch(
        `${env.SUPABASE_URL}/rest/v1/blog_posts?status=eq.published&slug=neq.${encodeURIComponent(slug)}&select=id,slug,title,category,cat_color,featured_image&order=published_at.desc&limit=3`,
        { headers }
      ),
    ]);
    const posts = await postRes.json();
    if (!posts || !posts.length) return html(notFoundPage(), 404);
    post    = posts[0];
    related = await relRes.json() || [];
  } catch (e) {
    return html(errorPage('Failed to load article.'), 500);
  }

  return html(renderPost(post, related), 200);
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// For URLs inside meta content attributes — only escape < > and " (not &)
function escUrl(s) {
  return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Strip HTML tags and decode common entities, then truncate for meta descriptions
function plainText(s, maxLen = 160) {
  const t = String(s || '')
    .replace(/<[^>]+>/g, ' ')        // strip tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t;
}

function renderPost(post, related) {
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const relCards = related.map(r => `
    <a class="rel-card" href="/posts/${esc(r.slug)}.html">
      ${r.featured_image
        ? `<img class="rel-thumb" src="${esc(r.featured_image)}" alt="${esc(r.title)}" loading="lazy"/>`
        : `<div class="rel-thumb-placeholder">🐾</div>`}
      <div class="rel-body">
        <div class="rel-cat" style="color:${esc(r.cat_color || '#ED6436')}">${esc(r.category || 'General')}</div>
        <div class="rel-title">${esc(r.title)}</div>
      </div>
    </a>`).join('');

  const heroHtml = post.featured_image
    ? `<div class="art-hero art-hero-img" style="background-image:url('${esc(post.featured_image)}')">
        <div class="art-hero-overlay"></div>
        <div class="art-hero-content">
          <div class="art-cat" style="background:${esc(post.cat_color || '#ED6436')}">${esc(post.category || 'General')}</div>
          <h1 class="art-title">${esc(post.title)}</h1>
          <div class="art-meta">
            <span>${esc(post.author || 'PuppyPlace')}</span>
            <span>·</span>
            <span>${esc(date)}</span>
            <span>·</span>
            <span>${esc(String(post.read_time || 5))} min read</span>
          </div>
        </div>
      </div>`
    : `<div class="art-hero">
        <div class="art-cat" style="background:${esc(post.cat_color || '#ED6436')}">${esc(post.category || 'General')}</div>
        <h1 class="art-title">${esc(post.title)}</h1>
        <div class="art-meta">
          <span>${esc(post.author || 'PuppyPlace')}</span>
          <span>·</span>
          <span>${esc(date)}</span>
          <span>·</span>
          <span>${esc(String(post.read_time || 5))} min read</span>
        </div>
      </div>`;

  const pageTitle = post.meta_title || (post.title + ' — PuppyPlace Blog');
  const metaDesc  = plainText(post.meta_description || post.excerpt) || plainText(post.content, 160);
  // Proxy image through Cloudflare so social crawlers (WhatsApp etc.) hit a trusted origin
  const imgUrl    = post.featured_image
    ? escUrl(`https://puppyplace.ng/api/og-img?url=${encodeURIComponent(post.featured_image)}`)
    : '';
  const postUrl   = `https://puppyplace.ng/posts/${escUrl(post.slug)}.html`;
  const jsonLd    = JSON.stringify({
    '@context':    'https://schema.org',
    '@type':       'BlogPosting',
    headline:      post.title      || '',
    description:   plainText(post.excerpt) || plainText(post.content, 200),
    image:         imgUrl || post.featured_image || '',
    author:    { '@type': 'Organization', name: 'PuppyPlace.ng' },
    publisher: { '@type': 'Organization', name: 'PuppyPlace.ng', url: 'https://puppyplace.ng' },
    datePublished: post.published_at || '',
    url:           `https://puppyplace.ng/posts/${post.slug}.html`,
  }).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}"/>
${post.focus_keyword ? `<meta name="keywords" content="${esc(post.focus_keyword)}"/>` : ''}
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="PuppyPlace"/>
<meta property="og:title" content="${esc(post.meta_title || post.title)}"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<meta property="og:url" content="${postUrl}"/>
${imgUrl ? `<meta property="og:image" content="${imgUrl}"/>
<meta property="og:image:secure_url" content="${imgUrl}"/>
<meta property="og:image:alt" content="${esc(post.title)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(post.meta_title || post.title)}"/>
<meta name="twitter:description" content="${esc(metaDesc)}"/>
${imgUrl ? `<meta name="twitter:image" content="${imgUrl}"/>` : ''}
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{height:100%}
body{font-family:'Nunito',sans-serif;background:#f8f9fa;color:#333;min-height:100%;display:flex;flex-direction:column}
a{text-decoration:none;color:inherit}
:root{--orange:#ed6436;--black:#0e0e0c;--gray:#868686;--light:#f1f3f5;--border:#e9ecef;--white:#fff;--r:12px;--shadow:0 4px 20px rgba(0,0,0,.06);--trans:.3s ease}
.nav{background:#1a1a18;padding:0 40px;height:64px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:sticky;top:0;z-index:100}
.nav-logo{color:#fff;font-size:22px;font-weight:900}.nav-logo span{color:var(--orange)}
.nav-back{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.85);border-radius:50px;padding:9px 20px;font-size:13px;font-weight:800;transition:all var(--trans)}
.nav-back:hover{background:var(--orange);border-color:var(--orange);color:#fff}
/* Hero — text only */
.art-hero{background:#1a1a18;padding:72px 40px 60px;text-align:center;position:relative;overflow:hidden;flex-shrink:0}
.art-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 60% 40%,rgba(237,100,54,.15),transparent 70%);pointer-events:none}
/* Hero — with featured image */
.art-hero-img{background:#1a1a18 center/cover no-repeat;padding:0;min-height:420px;display:flex;align-items:flex-end}
.art-hero-img::before{display:none}
.art-hero-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.25) 0%,rgba(0,0,0,.72) 100%);pointer-events:none}
.art-hero-content{position:relative;z-index:1;width:100%;padding:72px 40px 60px;text-align:center}
.art-cat{display:inline-block;color:#fff;font-size:11px;font-weight:800;padding:6px 18px;border-radius:50px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:20px}
.art-title{font-size:clamp(24px,5vw,44px);font-weight:900;color:#fff;line-height:1.25;max-width:760px;margin:0 auto 20px}
.art-meta{font-size:14px;color:rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
/* Content */
.art-wrap{max-width:780px;margin:0 auto;width:100%;flex:1}
.art-body{padding:56px 24px 0}
.art-body h4{font-size:21px;font-weight:900;margin:36px 0 12px;color:var(--black)}
.art-body p{margin:0 0 20px;font-size:17px;color:#444;line-height:1.85}
.art-body ul,.art-body ol{margin:0 0 20px;padding-left:26px}
.art-body li{margin-bottom:10px;font-size:17px;color:#444;line-height:1.75}
.art-body strong{font-weight:800;color:var(--black)}
.art-body em{font-style:italic}
.art-divider{width:60px;height:4px;background:var(--orange);border-radius:2px;margin:48px 24px}
.related{border-top:1px solid var(--border);padding:48px 24px 80px}
.rel-label{font-size:22px;font-weight:900;margin-bottom:24px;color:var(--black)}
.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
.rel-card{background:var(--light);border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden;display:block;transition:all var(--trans)}
.rel-card:hover{border-color:var(--orange);transform:translateY(-3px);box-shadow:var(--shadow)}
.rel-thumb{width:100%;height:140px;object-fit:cover;display:block}
.rel-thumb-placeholder{width:100%;height:140px;background:linear-gradient(135deg,#fdeee7,#fbd4c3);display:flex;align-items:center;justify-content:center;font-size:48px}
.rel-body{padding:16px}
.rel-cat{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.rel-title{font-size:15px;font-weight:800;line-height:1.4;color:var(--black)}
.footer{background:#1a1a18;color:rgba(255,255,255,.4);text-align:center;padding:32px 24px;font-size:13px;flex-shrink:0;margin-top:auto}
.footer a{color:rgba(255,255,255,.6);font-weight:700}.footer a:hover{color:var(--orange)}
@media(max-width:600px){.nav{padding:0 20px}.art-hero{padding:48px 20px 40px}.art-hero-img{min-height:300px}.art-hero-content{padding:48px 20px 40px}.art-body{padding:32px 20px 0}.related{padding:36px 20px 60px}}
</style>
</head>
<body>
<nav class="nav">
  <a class="nav-logo" href="/index.html">Puppy<span>Place</span></a>
  <a class="nav-back" href="/blog.html">← All Posts</a>
</nav>
${heroHtml}
<div class="art-wrap">
  <div class="art-body">${post.content || ''}</div>
  ${related.length ? `<div class="art-divider"></div><div class="related"><div class="rel-label">More from the Blog</div><div class="rel-grid">${relCards}</div></div>` : '<div style="padding-bottom:80px"></div>'}
</div>
<footer class="footer">
  &copy; 2025 <a href="/index.html">PuppyPlace.ng</a> &mdash; Your trusted pet store in Nigeria
</footer>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Post Not Found — PuppyPlace</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet"/>
<style>body{font-family:'Nunito',sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{font-size:32px;font-weight:900;margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{display:inline-block;background:#ed6436;color:#fff;border-radius:50px;padding:14px 32px;font-weight:800}</style>
</head><body><div style="font-size:72px;margin-bottom:20px">🐾</div><h1>Post Not Found</h1><p>This article doesn't exist or may have been removed.</p><a href="/blog.html">Browse All Posts</a></body></html>`;
}

function errorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Error — PuppyPlace</title>
<style>body{font-family:sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{color:#ed6436;font-weight:700}</style>
</head><body><h1>⚠️ ${esc(msg)}</h1><p>Please try again later.</p><a href="/blog.html">← All Posts</a></body></html>`;
}

async function serveSitemap(env) {
  if (!env.SUPABASE_URL) {
    return new Response('Server not configured', { status: 503 });
  }
  let posts;
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/blog_posts?status=eq.published&select=slug,published_at&order=published_at.desc`,
      { headers: sbHeaders(env) }
    );
    posts = await res.json();
    if (!Array.isArray(posts)) posts = [];
  } catch {
    return new Response('Failed to generate sitemap', { status: 500 });
  }

  const urls = posts.map(p => {
    const lastmod = p.published_at ? p.published_at.slice(0, 10) : '';
    return `  <url>\n    <loc>https://puppyplace.ng/posts/${encodeURIComponent(p.slug)}.html</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

/* ── ADMIN AUTH ── */

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function makeToken(env) {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000); // 8-hour session
  const sig = await hmacSign(expiry, env.ADMIN_TOKEN_SECRET);
  return `${expiry}:${sig}`;
}

async function verifyToken(token, env) {
  if (!token || !env.ADMIN_TOKEN_SECRET) return false;
  const colon = token.indexOf(':');
  if (colon === -1) return false;
  const expiry = token.slice(0, colon);
  const sig    = token.slice(colon + 1);
  if (Date.now() > parseInt(expiry, 10)) return false;
  const expected = await hmacSign(expiry, env.ADMIN_TOKEN_SECRET);
  return safeEqual(expected, sig);
}

async function handleAdminLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET) {
    return jsonResp({ error: 'Server not configured' }, 503);
  }
  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!safeEqual(String(body.password ?? ''), env.ADMIN_PASSWORD)) {
    return jsonResp({ error: 'Incorrect password' }, 401);
  }
  const token = await makeToken(env);
  return jsonResp({ ok: true, token }, 200);
}

async function handleAdminVerify(request, env) {
  let body;
  try { body = await request.json(); } catch { return jsonResp({ ok: false }, 400); }
  const valid = await verifyToken(body.token, env);
  return jsonResp({ ok: valid }, valid ? 200 : 401);
}

/* ── USER PROFILE UPDATE (phone → auth.users via service key) ── */

// Convert Nigerian local format (08012345678) to E.164 (+2348012345678)
function toE164NG(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return '+' + digits;
  if (digits.startsWith('0'))   return '+234' + digits.slice(1);
  return '+234' + digits;
}

async function handleUpdateProfile(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Verify caller has a valid session token
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
  }

  let body;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: cors }); }

  const { phone, name } = body;

  // Look up the user from their session token
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { 'Authorization': authHeader, 'apikey': env.SUPABASE_ANON },
  });
  const userData = await userRes.json();
  if (!userData || !userData.id) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: cors });
  }

  const serviceKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON;

  // Patch auth.users via admin API — phone must be E.164 for Supabase to accept it
  const patch = {};
  if (phone !== undefined) patch.phone = toE164NG(phone);
  if (name  !== undefined) patch.data  = { ...(userData.user_metadata || {}), name, phone };

  const patchRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userData.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'apikey': serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });

  if (!patchRes.ok) {
    const err = await patchRes.json().catch(() => ({}));
    return new Response(JSON.stringify({ error: err.message || 'Update failed' }), { status: 400, headers: cors });
  }

  // Also sync to public.profiles so both tables stay consistent
  if (phone !== undefined || name !== undefined) {
    const profilePatch = { updated_at: new Date().toISOString() };
    if (phone !== undefined) profilePatch.phone = phone; // store local format in profiles
    if (name  !== undefined) profilePatch.name  = name;

    await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userData.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(profilePatch),
    });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}

/* ── PRODUCT SSR ── */

async function serveProduct(slugOrId, env) {
  if (!env.SUPABASE_URL) return html(productErrorPage('Server not configured.'), 503);

  let product;
  try {
    const h = sbHeaders(env);
    const base = env.SUPABASE_URL;

    // 1. Try slug column lookup
    const slugRes = await fetch(`${base}/rest/v1/shop_products?slug=eq.${encodeURIComponent(slugOrId)}&active=eq.true&select=*`, { headers: h });
    if (slugRes.ok) {
      const rows = await slugRes.json();
      if (rows && rows.length) product = rows[0];
    }

    // 2. Try direct ID lookup
    if (!product) {
      const idRes = await fetch(`${base}/rest/v1/shop_products?id=eq.${encodeURIComponent(slugOrId)}&active=eq.true&select=*`, { headers: h });
      if (idRes.ok) {
        const rows = await idRes.json();
        if (rows && rows.length) product = rows[0];
      }
    }

    // 3. If slug--uuid format (transition from old URLs), extract uuid and retry
    if (!product) {
      const sep = slugOrId.lastIndexOf('--');
      if (sep >= 0) {
        const extractedId = slugOrId.slice(sep + 2);
        const idRes = await fetch(`${base}/rest/v1/shop_products?id=eq.${encodeURIComponent(extractedId)}&active=eq.true&select=*`, { headers: h });
        if (idRes.ok) {
          const rows = await idRes.json();
          if (rows && rows.length) product = rows[0];
        }
      }
    }
  } catch (e) {
    return html(productErrorPage('Failed to load product.'), 500);
  }

  if (!product) return html(productNotFoundPage(), 404);

  // Fetch related products from the same category (excluding current product)
  let related = [];
  try {
    const h = sbHeaders(env);
    const base = env.SUPABASE_URL;
    const catFilter = product.category ? `&category=eq.${encodeURIComponent(product.category)}` : '';
    const relRes = await fetch(
      `${base}/rest/v1/shop_products?active=eq.true&id=neq.${encodeURIComponent(product.id)}${catFilter}&select=id,name,slug,emoji,image_url,category,price,original_price&order=created_at.desc&limit=5`,
      { headers: h }
    );
    if (relRes.ok) related = await relRes.json() || [];
    // If same-category has fewer than 4, fill up with other products
    if (related.length < 4) {
      const excludeIds = [product.id, ...related.map(r => r.id)].map(id => `id=neq.${encodeURIComponent(id)}`).join('&');
      const fillRes = await fetch(
        `${base}/rest/v1/shop_products?active=eq.true&${excludeIds}&select=id,name,slug,emoji,image_url,category,price,original_price&order=created_at.desc&limit=${5 - related.length}`,
        { headers: h }
      );
      if (fillRes.ok) {
        const fill = await fillRes.json() || [];
        related = [...related, ...fill];
      }
    }
  } catch (e) { /* non-critical */ }

  return html(renderProductPage(product, related), 200);
}

function renderVarGroups(p) {
  const groups = Array.isArray(p.var_groups) && p.var_groups.length
    ? p.var_groups
    : (Array.isArray(p.variants) && p.variants.length ? [{ type: 'Size', values: p.variants }] : []);
  if (!groups.length) return '';
  return groups.map(g => {
    const label = g.type === 'Other' ? (g.customLabel || 'Option') : (g.type || 'Option');
    const opts = (g.values || []).map(v =>
      `<button class="pv-opt" onclick="this.closest('.pv-options').querySelectorAll('.pv-opt').forEach(b=>b.classList.remove('selected'));this.classList.add('selected')">${esc(v)}</button>`
    ).join('');
    return `<div class="pv-group"><div class="pv-label">${esc(label)}</div><div class="pv-options">${opts}</div></div>`;
  }).join('');
}

function renderProductPage(p, related = []) {
  const name     = p.name      || 'Product';
  const price    = p.price     ? '₦' + Number(p.price).toLocaleString('en-NG') : '';
  const origPrice= p.original_price ? '₦' + Number(p.original_price).toLocaleString('en-NG') : '';
  const disc     = (p.price && p.original_price) ? Math.round((1 - p.price / p.original_price) * 100) : 0;
  const desc     = p.description || '';
  const slug     = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const imgUrl   = p.image_url ? escUrl(`https://puppyplace.ng/api/og-img?url=${encodeURIComponent(p.image_url)}`) : '';
  const pageUrl  = `https://puppyplace.ng/product/${p.slug || slug}`;
  const metaDesc = plainText(desc, 160) || `${name} — available at PuppyPlace.ng`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: plainText(desc, 300),
    image: p.image_url || '',
    sku: p.id,
    brand: { '@type': 'Brand', name: p.brand || 'PuppyPlace' },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'NGN',
      price: String(p.price || 0),
      availability: 'https://schema.org/InStock',
      url: pageUrl,
    },
  }).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${esc(name)} — PuppyPlace.ng</title>
<meta name="description" content="${esc(metaDesc)}"/>
<meta property="og:type" content="product"/>
<meta property="og:site_name" content="PuppyPlace"/>
<meta property="og:title" content="${esc(name)} — PuppyPlace.ng"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<meta property="og:url" content="${escUrl(pageUrl)}"/>
${imgUrl ? `<meta property="og:image" content="${imgUrl}"/>
<meta property="og:image:secure_url" content="${imgUrl}"/>
<meta property="og:image:alt" content="${esc(name)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(name)}"/>
<meta name="twitter:description" content="${esc(metaDesc)}"/>
${imgUrl ? `<meta name="twitter:image" content="${imgUrl}"/>` : ''}
<script type="application/ld+json">${jsonLd}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Nunito',sans-serif;background:#f8f9fa;color:#333}
a{text-decoration:none;color:inherit}
:root{--orange:#ed6436;--black:#0e0e0c;--gray:#868686;--light:#f1f3f5;--border:#e9ecef;--white:#fff;--r:12px;--shadow:0 4px 20px rgba(0,0,0,.06)}
.nav{background:#1a1a18;padding:0 40px;height:64px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.nav-logo{color:#fff;font-size:20px;font-weight:900}.nav-logo span{color:var(--orange)}
.nav-back{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.85);border-radius:50px;padding:9px 20px;font-size:13px;font-weight:800}
.nav-back:hover{background:var(--orange);border-color:var(--orange);color:#fff}
.nav-icons{display:flex;align-items:center;gap:8px}
.nav-ico{position:relative;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.85);border-radius:50px;padding:9px 16px;font-size:14px;cursor:pointer;font-weight:800}
.nav-ico:hover{background:var(--orange);border-color:var(--orange);color:#fff}
.nav-badge{position:absolute;top:-5px;right:-5px;background:var(--orange);color:#fff;font-size:10px;font-weight:900;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;line-height:1}
/* DRAWERS */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:500;display:none;backdrop-filter:blur(4px)}
.overlay.open{display:block}
.drawer{position:fixed;top:0;bottom:0;width:420px;max-width:100vw;background:#fff;z-index:501;display:flex;flex-direction:column;box-shadow:-10px 0 30px rgba(0,0,0,.1);right:-100%;transition:right .3s cubic-bezier(0.4,0,0.2,1)}
.drawer.open{right:0}
.drawer-hd{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
.drawer-title{font-size:18px;font-weight:900;display:flex;align-items:center;gap:12px}
.drawer-cnt{background:var(--orange);color:#fff;font-size:12px;font-weight:800;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.drawer-close{background:var(--light);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:16px}
.drawer-foot{padding:20px;border-top:1px solid var(--border)}
.drawer-co-btn{width:100%;background:var(--orange);color:#fff;border:none;border-radius:50px;padding:14px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer}
.drawer-co-btn:hover{background:#c9530a}
.drawer-cont{width:100%;background:transparent;color:#333;border:1.5px solid var(--border);border-radius:50px;padding:12px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;margin-top:10px}
/* CHECKOUT MODAL */
.co-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}
.co-bg.open{display:flex}
.co-modal{background:#fff;border-radius:var(--r);width:100%;max-width:560px;max-height:92vh;overflow-y:auto;animation:popUp .25s ease;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.1)}
.co-hd{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
.co-hd-title{font-size:18px;font-weight:900}
.co-close{background:var(--light);border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:16px}
.co-steps{display:flex;align-items:center;padding:16px 24px;border-bottom:1px solid var(--border);flex-shrink:0}
.co-step{display:flex;align-items:center;gap:8px;flex:1}
.co-step-num{width:28px;height:28px;border-radius:50%;border:2px solid var(--border);background:#fff;font-size:12px;font-weight:900;color:var(--gray);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.co-step-label{font-size:13px;font-weight:700;color:var(--gray)}
.co-step.active .co-step-num{background:var(--orange);border-color:var(--orange);color:#fff}
.co-step.active .co-step-label{color:#0e0e0c}
.co-step.done .co-step-num{background:#0e0e0c;border-color:#0e0e0c;color:#fff}
.co-step.done .co-step-label{color:#0e0e0c}
.co-step-line{flex:1;height:2px;background:var(--border);margin:0 10px}
.co-step-line.done{background:#0e0e0c}
.co-body{flex:1;padding:24px;overflow-y:auto}
.co-section{display:none}
.co-section.active{display:block}
.co-summary{background:var(--light);border-radius:var(--r);padding:16px;margin-bottom:24px}
.co-sum-title{font-size:12px;font-weight:800;text-transform:uppercase;color:var(--gray);margin-bottom:12px}
.co-sum-items{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
.co-sum-item{display:flex;align-items:center;justify-content:space-between;font-size:14px}
.co-sum-item-left{display:flex;align-items:center;gap:10px}
.co-sum-emoji{font-size:20px}
.co-sum-name{font-weight:700}
.co-sum-qty{color:var(--gray);font-size:12px}
.co-sum-price{font-weight:900}
.co-sum-divider{height:1px;background:var(--border);margin:12px 0}
.co-sum-total{display:flex;justify-content:space-between;font-size:16px;font-weight:900}
.co-form{display:flex;flex-direction:column;gap:16px}
.co-field{display:flex;flex-direction:column;gap:6px}
.co-field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.co-label{font-size:12px;font-weight:800;color:#0e0e0c;text-transform:uppercase;letter-spacing:.05em}
.co-label span{color:var(--orange)}
.co-input{border:1.5px solid var(--border);border-radius:var(--r);padding:12px 16px;font-family:'Nunito',sans-serif;font-size:14px;outline:none;background:var(--light)}
.co-input:focus{border-color:var(--orange);background:#fff}
.co-input.error{border-color:#e74c3c}
.co-select{appearance:none}
.co-err{font-size:11px;color:#e74c3c;font-weight:700;display:none;margin-top:4px}
.co-err.show{display:block}
.co-pay-info{background:linear-gradient(135deg,#fff8f5,#fdeee7);border:1px solid rgba(237,100,54,.2);border-radius:var(--r);padding:20px;margin-bottom:24px;display:flex;gap:16px;align-items:center}
.co-pay-ico{font-size:28px;flex-shrink:0}
.co-pay-text h4{font-size:15px;font-weight:900;margin-bottom:4px}
.co-pay-text p{font-size:13px;color:var(--gray);line-height:1.6}
.co-test-banner{background:#e8f4fd;border:1px solid #bee3f8;border-radius:6px;padding:12px 16px;font-size:13px;font-weight:700;color:#2b6cb0;margin-bottom:20px}
.co-success{text-align:center;padding:24px 0}
.co-success-ico{font-size:80px;margin-bottom:20px}
.co-success h3{font-size:26px;font-weight:900;margin-bottom:10px}
.co-success p{font-size:15px;color:var(--gray);line-height:1.7;margin-bottom:24px}
.co-success-ref{background:var(--light);border-radius:6px;padding:14px 20px;font-size:14px;font-weight:700;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between}
.co-success-steps{text-align:left;background:var(--light);border-radius:var(--r);padding:20px;margin-bottom:24px}
.co-success-steps h4{font-size:13px;font-weight:800;text-transform:uppercase;color:var(--gray);margin-bottom:12px}
.co-ss-item{display:flex;gap:12px;margin-bottom:12px;font-size:14px;line-height:1.6}
.co-ss-dot{width:24px;height:24px;border-radius:50%;background:var(--orange);color:#fff;font-size:12px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.co-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:12px;flex-shrink:0}
.co-btn-back{background:var(--light);border:none;border-radius:50px;padding:14px 24px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer}
.co-btn-next{flex:1;background:var(--orange);color:#fff;border:none;border-radius:50px;padding:14px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}
.co-btn-next:hover{background:#c9530a}
.co-btn-next:disabled{opacity:.6;cursor:not-allowed}
.co-spinner{width:18px;height:18px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;display:none}
.co-spinner.show{display:block;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:480px){.co-field-row{grid-template-columns:1fr}}
.page{max-width:1100px;margin:0 auto;padding:40px 24px}
.product-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.img-box{border-radius:var(--r);overflow:hidden;background:var(--light);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:120px;position:relative}
.img-box img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.product-info{}
.pi-cat{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--orange);margin-bottom:8px}
.pi-name{font-size:clamp(22px,3vw,34px);font-weight:900;color:var(--black);line-height:1.2;margin-bottom:14px}
.pi-price{font-size:32px;font-weight:900;color:var(--black);margin-bottom:6px}
.pi-orig{font-size:16px;color:var(--gray);text-decoration:line-through;display:inline-block;margin-right:8px}
.pi-disc{background:rgba(231,76,60,.1);color:#e74c3c;font-size:13px;font-weight:800;padding:4px 10px;border-radius:6px;display:inline-block}
.pi-rating{display:flex;align-items:center;gap:8px;margin:12px 0 20px;font-size:14px;color:var(--gray);font-weight:700}
.pi-stars{color:#f39c12;font-size:16px}
.pi-desc{font-size:15px;line-height:1.9;color:#555;margin-bottom:24px;border-top:1px solid var(--border);padding-top:20px}
.pi-desc strong,pi-desc b{font-weight:800;color:var(--black)}
.pi-desc ul{padding-left:20px;margin:8px 0}
.pi-desc li{margin-bottom:5px}
.pi-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
.pi-meta-item{background:var(--light);border-radius:var(--r);padding:12px 16px}
.pi-meta-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--gray);margin-bottom:4px}
.pi-meta-val{font-size:14px;font-weight:700;color:var(--black)}
.pi-actions{display:flex;gap:12px;margin-bottom:10px}
.btn-cart{flex:1;background:var(--orange);color:#fff;border:none;border-radius:50px;padding:15px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer}
.btn-cart:hover{background:#c9530a}
.btn-wish{background:var(--white);border:1.5px solid var(--border);color:var(--black);border-radius:50px;padding:15px 22px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer}
.btn-wish:hover{border-color:var(--orange);color:var(--orange)}
.breadcrumb{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--gray);margin-bottom:24px}
.breadcrumb a{color:var(--orange);font-weight:700}
.breadcrumb a:hover{text-decoration:underline}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a18;color:#fff;border-radius:50px;padding:12px 28px;font-size:13px;font-weight:800;z-index:9999;animation:popUp .3s ease;white-space:nowrap}
@keyframes popUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
footer{background:#1a1a18;color:rgba(255,255,255,.6);padding:40px 40px 24px;margin-top:60px;text-align:center}
.footer-logo{font-size:20px;font-weight:900;color:#fff;margin-bottom:8px}.footer-logo span{color:var(--orange)}
.footer-links{display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:20px}
.footer-links a{font-size:13px;color:rgba(255,255,255,.55)}
.footer-links a:hover{color:var(--orange)}
.footer-copy{font-size:12px;color:rgba(255,255,255,.3)}
.pv-group{margin-bottom:16px}
.pv-label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--gray);margin-bottom:8px}
.pv-options{display:flex;flex-wrap:wrap;gap:8px}
.pv-opt{border:1.5px solid var(--border);border-radius:50px;padding:7px 16px;font-size:13px;font-weight:700;cursor:pointer;background:var(--white);font-family:'Nunito',sans-serif;transition:all .15s}
.pv-opt:hover{border-color:var(--orange);color:var(--orange)}
.pv-opt.selected{border-color:var(--orange);background:var(--orange);color:#fff}
.related-section{padding:48px 0 0}
.related-title{font-size:18px;font-weight:900;color:var(--black);margin-bottom:16px}
.related-scroll{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding-bottom:12px;scrollbar-width:none}
.related-scroll::-webkit-scrollbar{display:none}
.rel-prod-card{display:block;background:var(--white);border-radius:var(--r);overflow:hidden;border:1px solid var(--border);transition:box-shadow .2s;flex:0 0 160px;scroll-snap-align:start}
.rel-prod-card:hover{box-shadow:var(--shadow)}
.rel-prod-img{aspect-ratio:1;background:var(--light);display:flex;align-items:center;justify-content:center;font-size:48px;overflow:hidden;position:relative}
.rel-prod-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.rel-prod-info{padding:10px}
.rel-prod-cat{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--orange);margin-bottom:3px}
.rel-prod-name{font-size:12px;font-weight:800;color:var(--black);margin-bottom:5px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rel-prod-price{font-size:14px;font-weight:900;color:var(--black)}
.rel-prod-orig{font-size:11px;color:var(--gray);text-decoration:line-through;font-weight:600;display:block;margin-top:1px}
.rel-prod-disc{background:#ed6436;color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;position:absolute;top:8px;left:8px}
/* Mobile search bar */
.mob-search-bar{display:none;padding:10px 16px;background:#fff;border-bottom:1px solid #e9ecef;position:sticky;top:56px;z-index:99;box-shadow:0 4px 20px rgba(0,0,0,.06)}
.mob-si{display:flex;align-items:center;background:#f1f3f5;border:1.5px solid #e9ecef;border-radius:50px;overflow:hidden}
.mob-si input{flex:1;border:none;background:transparent;padding:10px 16px;font-family:'Nunito',sans-serif;font-size:14px;outline:none}
.mob-si button{background:#ed6436;border:none;width:50px;height:44px;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;color:#fff}
/* Mobile sticky Add to Cart bar */
.mob-atc-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff;border-top:1.5px solid #e9ecef;padding:12px 16px;align-items:center;gap:12px;box-shadow:0 -4px 24px rgba(0,0,0,.14)}
@media(max-width:768px){
  .nav{padding:0 12px;height:56px}
  .nav-back{padding:7px 12px;font-size:12px}
  .nav-ico{padding:7px 11px;font-size:13px}
  .page{padding:24px 16px}
  .product-grid{grid-template-columns:1fr;gap:20px}
  .img-box{max-height:320px}
  .pi-meta{grid-template-columns:1fr}
  .pi-actions{flex-direction:column}
  footer{padding:32px 20px 20px}
  .co-field-row{grid-template-columns:1fr}
  .mob-search-bar{display:block}
  .mob-atc-bar{display:flex!important}
  body{padding-bottom:80px}
}
</style>
</head>
<body>
<nav class="nav">
  <a href="/index.html" class="nav-logo">Puppy<span>Place</span></a>
  <div class="nav-icons">
    <a href="/shop.html" class="nav-back" style="margin-right:4px">← Shop</a>
    <div class="nav-ico" onclick="openWishlist()">❤️<span class="nav-badge" id="wBadge">0</span></div>
    <div class="nav-ico" onclick="openCart()">🛒<span class="nav-badge" id="cBadge">0</span></div>
    <a href="/account.html" class="nav-ico">👤</a>
  </div>
</nav>
<div class="mob-search-bar">
  <div class="mob-si">
    <input type="text" id="mobSI" placeholder="Search products…" onkeydown="if(event.key==='Enter')goSearch()"/>
    <button onclick="goSearch()">🔍</button>
  </div>
</div>

<div class="page">
  <div class="breadcrumb">
    <a href="/index.html">Home</a> ›
    <a href="/shop.html">Shop</a> ›
    ${p.category ? `<a href="/shop.html?cat=${esc(p.category)}">${esc(p.category)}</a> › ` : ''}
    <span>${esc(name)}</span>
  </div>

  <div class="product-grid">
    <div class="img-box">
      ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(name)}" loading="eager"/>` : `<span>${esc(p.emoji || '📦')}</span>`}
    </div>

    <div class="product-info">
      ${p.category ? `<div class="pi-cat">${esc(p.category)} ${p.pet_type ? `· ${esc(p.pet_type)}` : ''}</div>` : ''}
      <div class="pi-name">${esc(name)}</div>
      <div>
        <span class="pi-price">${esc(price)}</span>
        ${origPrice ? `<span class="pi-orig">${esc(origPrice)}</span>` : ''}
        ${disc > 0 ? `<span class="pi-disc">-${disc}%</span>` : ''}
      </div>
      <div class="pi-rating">
        <span class="pi-stars">★★★★${(p.rating || 4.5) >= 5 ? '★' : '☆'}</span>
        <span>${esc(String(p.rating || '4.5'))} · ${esc(String(p.review_count || 0))} reviews</span>
      </div>
      ${renderVarGroups(p) ? `<div style="margin-bottom:20px">${renderVarGroups(p)}</div>` : ''}
      ${desc ? `<div class="pi-desc">${desc}</div>` : ''}
      <div class="pi-meta">
        ${p.category ? `<div class="pi-meta-item"><div class="pi-meta-label">Category</div><div class="pi-meta-val">${esc(p.category)}</div></div>` : ''}
        ${p.pet_type  ? `<div class="pi-meta-item"><div class="pi-meta-label">For</div><div class="pi-meta-val">${esc(p.pet_type)}</div></div>` : ''}
        ${p.brand     ? `<div class="pi-meta-item"><div class="pi-meta-label">Brand</div><div class="pi-meta-val">${esc(p.brand)}</div></div>` : ''}
        <div class="pi-meta-item"><div class="pi-meta-label">Stock</div><div class="pi-meta-val" style="color:#2ecc71">✅ In Stock</div></div>
      </div>
      <div class="pi-actions">
        <button class="btn-cart" onclick="addToCartBtn()">🛒 Add to Cart</button>
        <button class="btn-wish" onclick="addToWishBtn()">❤️ Wishlist</button>
      </div>
      <div style="font-size:13px;color:var(--gray);margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;">
        <span>🚚 Fast delivery across Nigeria</span>
        <span>↩️ 7-day returns</span>
      </div>
    </div>
  </div>

  ${related.length ? `<section class="related-section">
    <h2 class="related-title">Customers Also Viewed</h2>
    <div class="related-scroll">
      ${related.map(r => {
        const rPrice = r.price ? '&#x20A6;' + Number(r.price).toLocaleString('en-NG') : '';
        const rOrig  = r.original_price ? '&#x20A6;' + Number(r.original_price).toLocaleString('en-NG') : '';
        const rDisc  = (r.price && r.original_price) ? Math.round((1 - r.price / r.original_price) * 100) : 0;
        const rSlug  = r.slug || (r.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return `<a href="/product/${esc(rSlug)}.html" class="rel-prod-card">
          <div class="rel-prod-img">
            ${r.image_url ? `<img src="${esc(r.image_url)}" alt="${esc(r.name || '')}" loading="lazy"/>` : `<span>${esc(r.emoji || '📦')}</span>`}
            ${rDisc > 0 ? `<span class="rel-prod-disc">-${rDisc}%</span>` : ''}
          </div>
          <div class="rel-prod-info">
            <div class="rel-prod-name">${esc(r.name || '')}</div>
            <div class="rel-prod-price">${rPrice}</div>
            ${rOrig ? `<span class="rel-prod-orig">${rOrig}</span>` : ''}
          </div>
        </a>`;
      }).join('')}
    </div>
  </section>` : ''}
</div>

<!-- CART DRAWER -->
<div class="overlay" id="cartOverlay" onclick="closeCart()"></div>
<div class="drawer" id="cartDrawer">
  <div class="drawer-hd">
    <div class="drawer-title">&#x1F6D2; Your Cart <span class="drawer-cnt" id="cartDrawerCount">0</span></div>
    <button class="drawer-close" onclick="closeCart()">&#x2715;</button>
  </div>
  <div style="flex:1;overflow-y:auto;padding:0 20px;">
    <div id="cartEmpty" style="text-align:center;padding:60px 20px;color:var(--gray);"><div style="font-size:56px;margin-bottom:14px;opacity:.35;">&#x1F6D2;</div><p style="font-size:16px;font-weight:700;">Your cart is empty</p></div>
    <div id="cartItems"></div>
  </div>
  <div id="cartFooter" style="display:none;" class="drawer-foot">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><span style="font-size:14px;color:var(--gray);font-weight:700;">Subtotal</span><span style="font-size:20px;font-weight:900;" id="cartTotal">&#x20A6;0</span></div>
    <button class="drawer-co-btn" onclick="openCheckout()">Proceed to Checkout &#x2192;</button>
    <button class="drawer-cont" onclick="closeCart()">&#x2190; Continue Shopping</button>
  </div>
</div>
<!-- WISHLIST DRAWER -->
<div class="overlay" id="wishOverlay" onclick="closeWishlist()"></div>
<div class="drawer" id="wishDrawer">
  <div class="drawer-hd">
    <div class="drawer-title">&#x2764;&#xFE0F; Wishlist <span class="drawer-cnt" id="wishDrawerCount">0</span></div>
    <button class="drawer-close" onclick="closeWishlist()">&#x2715;</button>
  </div>
  <div style="flex:1;overflow-y:auto;padding:0 20px;">
    <div id="wishEmpty" style="text-align:center;padding:60px 20px;color:var(--gray);"><div style="font-size:56px;margin-bottom:14px;opacity:.35;">&#x2764;</div><p style="font-size:16px;font-weight:700;">Your wishlist is empty</p></div>
    <div id="wishItems"></div>
  </div>
  <div id="wishFooter" style="display:none;" class="drawer-foot">
    <button class="drawer-co-btn" onclick="moveAllToCart()">&#x1F6D2; Move All to Cart</button>
    <button class="drawer-cont" onclick="closeWishlist()">&#x2190; Keep Browsing</button>
  </div>
</div>
<!-- CHECKOUT MODAL -->
<div class="co-bg" id="coBg" onclick="if(event.target===this)closeCheckout()">
  <div class="co-modal" onclick="event.stopPropagation()">
    <div class="co-hd"><div class="co-hd-title">&#x1F6D2; Checkout</div><button class="co-close" onclick="closeCheckout()">&#x2715;</button></div>
    <div class="co-steps">
      <div class="co-step active" id="step1ind"><span class="co-step-num">1</span><span class="co-step-label">Details</span></div>
      <div class="co-step-line" id="line1"></div>
      <div class="co-step" id="step2ind"><span class="co-step-num">2</span><span class="co-step-label">Review</span></div>
      <div class="co-step-line" id="line2"></div>
      <div class="co-step" id="step3ind"><span class="co-step-num">3</span><span class="co-step-label">Payment</span></div>
    </div>
    <div class="co-body">
      <div class="co-section active" id="coStep1">
        <div class="co-form">
          <div class="co-field-row">
            <div class="co-field"><label class="co-label">Full Name <span>*</span></label><input class="co-input" id="coName" type="text" placeholder="e.g. Emeka Okafor"/><span class="co-err" id="coNameErr">Please enter your full name</span></div>
            <div class="co-field"><label class="co-label">Phone <span>*</span></label><input class="co-input" id="coPhone" type="tel" placeholder="e.g. 08012345678"/><span class="co-err" id="coPhoneErr">Please enter a valid phone number</span></div>
          </div>
          <div class="co-field"><label class="co-label">Email Address <span>*</span></label><input class="co-input" id="coEmail" type="email" placeholder="emeka@example.com"/><span class="co-err" id="coEmailErr">Please enter a valid email address</span></div>
          <div class="co-field"><label class="co-label">Delivery Address <span>*</span></label><input class="co-input" id="coAddress" type="text" placeholder="Street address, area, landmark&#x2026;"/><span class="co-err" id="coAddressErr">Please enter your delivery address</span></div>
          <div class="co-field">
            <label class="co-label">State <span>*</span></label>
            <select class="co-input co-select" id="coState"><option value="">Select your state&#x2026;</option><option>Abia</option><option>Adamawa</option><option>Akwa Ibom</option><option>Anambra</option><option>Bauchi</option><option>Bayelsa</option><option>Benue</option><option>Borno</option><option>Cross River</option><option>Delta</option><option>Ebonyi</option><option>Edo</option><option>Ekiti</option><option>Enugu</option><option>FCT &#x2014; Abuja</option><option>Gombe</option><option>Imo</option><option>Jigawa</option><option>Kaduna</option><option>Kano</option><option>Katsina</option><option>Kebbi</option><option>Kogi</option><option>Kwara</option><option>Lagos</option><option>Nasarawa</option><option>Niger</option><option>Ogun</option><option>Ondo</option><option>Osun</option><option>Oyo</option><option>Plateau</option><option>Rivers</option><option>Sokoto</option><option>Taraba</option><option>Yobe</option><option>Zamfara</option></select>
            <span class="co-err" id="coStateErr">Please select your state</span>
          </div>
          <div class="co-field"><label class="co-label">Order Notes <span style="color:var(--gray);font-weight:600;text-transform:none;">(optional)</span></label><input class="co-input" id="coNotes" type="text" placeholder="Any special instructions&#x2026;"/></div>
        </div>
      </div>
      <div class="co-section" id="coStep2">
        <div class="co-summary" id="coSummaryBlock"></div>
        <div style="background:var(--light);border-radius:var(--r);padding:16px;font-size:13px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--gray);margin-bottom:10px">Delivering to</div><div id="coReviewDetails" style="display:flex;flex-direction:column;gap:5px"></div></div>
      </div>
      <div class="co-section" id="coStep3">
        <div class="co-test-banner">&#x1F9EA; Test mode &#x2014; use card <strong>4084 0840 8408 4081</strong> &#xB7; Exp: any future date &#xB7; CVV: any 3 digits</div>
        <div class="co-pay-info"><div class="co-pay-ico">&#x1F512;</div><div class="co-pay-text"><h4>Secure payment via Paystack</h4><p>Your payment is encrypted and processed securely. PuppyPlace.ng never stores your card details.</p></div></div>
        <div class="co-summary" id="coPaySummary"></div>
        <div style="text-align:center;font-size:11px;color:var(--gray);font-weight:700;">&#x1F510; SSL Encrypted &nbsp;&#xB7;&nbsp; &#x2705; Paystack Secured &nbsp;&#xB7;&nbsp; &#x1F1F3;&#x1F1EC; Nigerian Payment Gateway</div>
      </div>
      <div class="co-section" id="coStep4">
        <div class="co-success">
          <div class="co-success-ico">&#x1F389;</div>
          <h3>Order Confirmed!</h3>
          <p>Thank you for shopping with PuppyPlace.ng. A confirmation email is on its way to you.</p>
          <div class="co-success-ref"><span>Order Reference</span><strong id="coOrderRef">&#x2014;</strong></div>
          <div class="co-success-steps"><h4>What happens next</h4>
            <div class="co-ss-item"><div class="co-ss-dot">1</div><div><strong>Confirmation email</strong> sent to your inbox within 2 minutes.</div></div>
            <div class="co-ss-item"><div class="co-ss-dot">2</div><div><strong>Order processing</strong> begins immediately.</div></div>
            <div class="co-ss-item"><div class="co-ss-dot">3</div><div><strong>Delivery update</strong> with tracking info and expected date.</div></div>
          </div>
          <button class="drawer-co-btn" onclick="closeCheckout()">Continue Shopping &#x1F43E;</button>
        </div>
      </div>
    </div>
    <div class="co-footer" id="coFooter">
      <button class="co-btn-back" id="coBtnBack" onclick="coBack()" style="display:none">&#x2190; Back</button>
      <button class="co-btn-next" id="coBtnNext" onclick="coNext()"><span id="coBtnLabel">Continue to Review</span><div class="co-spinner" id="coSpinner"></div></button>
    </div>
  </div>
</div>

<!-- MOBILE STICKY ADD TO CART BAR -->
<div class="mob-atc-bar">
  <a href="https://wa.me/2348000000000?text=${encodeURIComponent('Hi! I\'m interested in ' + name + ' (' + price + ')')}" target="_blank" rel="noopener"
     style="width:54px;height:54px;background:#25D366;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;text-decoration:none;">💬</a>
  <button onclick="addToCartBtn()" style="flex:1;height:54px;background:#ed6436;color:#fff;border:none;border-radius:12px;font-family:'Nunito',sans-serif;font-size:15px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">🛒 Add to Cart</button>
</div>

<footer>
  <div class="footer-logo">Puppy<span>Place</span>.ng</div>
  <div class="footer-links">
    <a href="/index.html">Home</a>
    <a href="/shop.html">Shop</a>
    <a href="/about.html">About</a>
    <a href="/contact.html">Contact</a>
    <a href="/privacy.html">Privacy</a>
  </div>
  <div class="footer-copy">&copy; 2025 PuppyPlace.ng &#x2014; All rights reserved.</div>
</footer>

<script>window.__pp_prod=${JSON.stringify({id:String(p.id||''),n:name,e:p.emoji||'📦',cat:p.category||'',p:Number(p.price)||0}).replace(/<\//g,'<\\/')};</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js"></script>
<script src="https://js.paystack.co/v1/inline.js"></script>
<script src="/config.js"></script>
<script>
const fmt=n=>'₦'+n.toLocaleString('en-NG');
const escH=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const PAYSTACK_PUBLIC_KEY=(window.PPCONFIG&&window.PPCONFIG.PAYSTACK_PUBLIC_KEY)||'';
const N8N_WEBHOOK_URL=(window.PPCONFIG&&window.PPCONFIG.N8N_WEBHOOK_URL)||'';
let _supabase=null;
try{if(window.supabase&&window.PPCONFIG&&window.PPCONFIG.SUPABASE_URL){_supabase=window.supabase.createClient(window.PPCONFIG.SUPABASE_URL,window.PPCONFIG.SUPABASE_ANON);}}catch(e){console.warn('Supabase init failed:',e.message);}
let cartItems=[],wishItems=[];
try{var _rc=localStorage.getItem('pp_cart');var _pc=JSON.parse(_rc||'[]');cartItems=Array.isArray(_pc)?_pc:[];}catch(e){cartItems=[];}
try{var _rw=localStorage.getItem('pp_wish');var _pw=JSON.parse(_rw||'[]');wishItems=Array.isArray(_pw)?_pw:[];}catch(e){wishItems=[];}
function saveCart(){try{localStorage.setItem('pp_cart',JSON.stringify(cartItems));}catch(e){}}
function saveWish(){try{localStorage.setItem('pp_wish',JSON.stringify(wishItems));}catch(e){}}
function updateBadges(){
  var qty=cartItems.reduce(function(s,i){return s+(i.qty||0);},0);
  var cb=document.getElementById('cBadge'),wb=document.getElementById('wBadge'),cd=document.getElementById('cartDrawerCount'),wd=document.getElementById('wishDrawerCount');
  if(cb)cb.textContent=qty;if(wb)wb.textContent=wishItems.length;if(cd)cd.textContent=qty;if(wd)wd.textContent=wishItems.length;
}
function showToast(msg){var t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove();},2500);}
function addToCartBtn(){
  var prod=window.__pp_prod||{};
  var id=prod.id;if(!id)return;
  var ex=cartItems.find(function(i){return i.id===id;});
  if(ex)ex.qty++;else cartItems.push({id:id,n:prod.n,e:prod.e,cat:prod.cat,p:prod.p||0,qty:1});
  try{saveCart();}catch(e){}
  try{updateBadges();}catch(e){}
  try{renderCartDrawer();}catch(e){console.error('[PuppyPlace] renderCartDrawer error:',e);}
  openCart();
}
function removeFromCart(id){
  cartItems=cartItems.filter(function(i){return i.id!==id;});
  saveCart();updateBadges();renderCartDrawer();
}
function changeQty(id,delta){
  var item=cartItems.find(function(i){return i.id===id;});
  if(!item)return;
  item.qty+=delta;
  if(item.qty<=0){removeFromCart(id);return;}
  saveCart();updateBadges();renderCartDrawer();
}
function renderCartDrawer(){
  var itemsEl=document.getElementById('cartItems'),emptyEl=document.getElementById('cartEmpty'),footerEl=document.getElementById('cartFooter'),totalEl=document.getElementById('cartTotal');
  if(!cartItems.length){emptyEl.style.display='';itemsEl.innerHTML='';footerEl.style.display='none';return;}
  emptyEl.style.display='none';footerEl.style.display='block';
  itemsEl.innerHTML=cartItems.map(function(item){
    return '<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #e9ecef;position:relative;">'
      +'<div style="width:64px;height:64px;background:#f1f3f5;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;">'+escH(item.e)+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:10px;color:#868686;font-weight:700;text-transform:uppercase;margin-bottom:2px;">'+escH(item.cat)+'</div>'
        +'<div style="font-size:14px;font-weight:800;margin-bottom:5px;">'+escH(item.n)+'</div>'
        +'<div style="font-size:15px;font-weight:900;color:#ed6436;">'+fmt(item.p*item.qty)+'</div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">'
          +'<button style="width:28px;height:28px;border-radius:50%;border:1px solid #e9ecef;background:#fff;cursor:pointer;" onclick="changeQty(&#39;'+escH(item.id)+'&#39;,-1)">&minus;</button>'
          +'<span style="font-size:13px;font-weight:800;">'+item.qty+'</span>'
          +'<button style="width:28px;height:28px;border-radius:50%;border:1px solid #e9ecef;background:#fff;cursor:pointer;" onclick="changeQty(&#39;'+escH(item.id)+'&#39;,1)">+</button>'
        +'</div>'
      +'</div>'
      +'<button style="position:absolute;top:14px;right:0;background:none;border:none;color:#ccc;font-size:16px;cursor:pointer;" onclick="removeFromCart(&#39;'+escH(item.id)+'&#39;)">&times;</button>'
      +'</div>';
  }).join('');
  totalEl.textContent=fmt(cartItems.reduce(function(s,i){return s+i.p*i.qty;},0));
}
function openCart(){document.getElementById('cartDrawer').classList.add('open');document.getElementById('cartOverlay').classList.add('open');document.body.style.overflow='hidden';}
function closeCart(){document.getElementById('cartDrawer').classList.remove('open');document.getElementById('cartOverlay').classList.remove('open');document.body.style.overflow='';}
function addToWishBtn(){
  var prod=window.__pp_prod||{};
  var id=prod.id;if(!id)return;
  if(wishItems.find(function(i){return i.id===id;})){showToast('Already in wishlist!');return;}
  wishItems.push({id:id,n:prod.n,e:prod.e,cat:prod.cat,p:prod.p||0});
  try{saveWish();}catch(e){}
  try{updateBadges();}catch(e){}
  try{renderWishDrawer();}catch(e){console.error('[PuppyPlace] renderWishDrawer error:',e);}
  openWishlist();
}
function removeFromWish(id){
  wishItems=wishItems.filter(function(i){return i.id!==id;});
  saveWish();updateBadges();renderWishDrawer();
}
function moveToCart(id){
  var item=wishItems.find(function(i){return i.id===id;});
  if(!item)return;
  removeFromWish(id);
  var ex=cartItems.find(function(i){return i.id===id;});
  if(ex)ex.qty++;else cartItems.push(Object.assign({},item,{qty:1}));
  saveCart();updateBadges();renderCartDrawer();openCart();
}
function moveAllToCart(){
  wishItems.forEach(function(i){
    var ex=cartItems.find(function(c){return c.id===i.id;});
    if(ex)ex.qty++;else cartItems.push(Object.assign({},i,{qty:1}));
  });
  wishItems=[];
  saveCart();saveWish();updateBadges();renderWishDrawer();renderCartDrawer();closeWishlist();openCart();
}
function renderWishDrawer(){
  var itemsEl=document.getElementById('wishItems'),emptyEl=document.getElementById('wishEmpty'),footerEl=document.getElementById('wishFooter');
  if(!wishItems.length){emptyEl.style.display='';itemsEl.innerHTML='';footerEl.style.display='none';return;}
  emptyEl.style.display='none';footerEl.style.display='block';
  itemsEl.innerHTML=wishItems.map(function(item){
    return '<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #e9ecef;position:relative;">'
      +'<div style="width:64px;height:64px;background:#f1f3f5;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;">'+escH(item.e)+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:14px;font-weight:800;margin-bottom:5px;">'+escH(item.n)+'</div>'
        +'<div style="font-size:15px;font-weight:900;">'+fmt(item.p)+'</div>'
        +'<button style="margin-top:8px;padding:6px 12px;font-size:11px;background:#0e0e0c;color:#fff;border:none;border-radius:50px;cursor:pointer;font-family:inherit;font-weight:800;" onclick="moveToCart(&#39;'+escH(item.id)+'&#39;)">Add to Cart</button>'
      +'</div>'
      +'<button style="position:absolute;top:14px;right:0;background:none;border:none;color:#ccc;font-size:16px;cursor:pointer;" onclick="removeFromWish(&#39;'+escH(item.id)+'&#39;)">&times;</button>'
      +'</div>';
  }).join('');
}
function openWishlist(){document.getElementById('wishDrawer').classList.add('open');document.getElementById('wishOverlay').classList.add('open');document.body.style.overflow='hidden';}
function closeWishlist(){document.getElementById('wishDrawer').classList.remove('open');document.getElementById('wishOverlay').classList.remove('open');document.body.style.overflow='';}
var coCurrentStep=1;
function cartTotal(){return cartItems.reduce(function(s,i){return s+i.p*i.qty;},0);}
function openCheckout(){
  if(!cartItems.length){alert('Your cart is empty!');return;}
  closeCart();coCurrentStep=1;renderCoStep(1);
  document.getElementById('coBg').classList.add('open');document.body.style.overflow='hidden';
}
function closeCheckout(){document.getElementById('coBg').classList.remove('open');document.body.style.overflow='';}
function renderCoStep(step){
  document.querySelectorAll('.co-section').forEach(function(s){s.classList.remove('active');});
  document.getElementById('coStep'+step).classList.add('active');
  [1,2,3].forEach(function(n){
    var el=document.getElementById('step'+n+'ind');
    el.classList.remove('active','done');
    if(n<step)el.classList.add('done');else if(n===step)el.classList.add('active');
  });
  document.getElementById('line1').classList.toggle('done',step>1);
  document.getElementById('line2').classList.toggle('done',step>2);
  var footer=document.getElementById('coFooter'),btnBack=document.getElementById('coBtnBack'),btnLbl=document.getElementById('coBtnLabel');
  if(step===4){footer.style.display='none';return;}
  footer.style.display='';btnBack.style.display=step>1?'':'none';
  if(step===1)btnLbl.textContent='Continue to Review →';
  if(step===2){btnLbl.textContent='Proceed to Payment →';buildReview();}
  if(step===3){btnLbl.textContent='🔒 Pay Now — '+fmt(cartTotal());buildPaySummary();}
}
function coNext(){
  if(coCurrentStep===1){if(!validateStep1())return;coCurrentStep=2;}
  else if(coCurrentStep===2){coCurrentStep=3;}
  else if(coCurrentStep===3){launchPaystack();return;}
  renderCoStep(coCurrentStep);
}
function coBack(){if(coCurrentStep>1){coCurrentStep--;renderCoStep(coCurrentStep);}}
function validateStep1(){
  var ok=true;
  [{id:'coName',err:'coNameErr',test:function(v){return v.trim().length>=2;}},
   {id:'coPhone',err:'coPhoneErr',test:function(v){return /^0[7-9][01]\\d{8}$/.test(v.replace(/\\s/g,''));}},
   {id:'coEmail',err:'coEmailErr',test:function(v){return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v);}},
   {id:'coAddress',err:'coAddressErr',test:function(v){return v.trim().length>=5;}},
   {id:'coState',err:'coStateErr',test:function(v){return v!=='';}}
  ].forEach(function(f){
    var inp=document.getElementById(f.id),err=document.getElementById(f.err),valid=f.test(inp.value);
    inp.classList.toggle('error',!valid);err.classList.toggle('show',!valid);if(!valid)ok=false;
  });
  return ok;
}
['coName','coPhone','coEmail','coAddress','coState'].forEach(function(id){
  var el=document.getElementById(id);
  if(el)el.addEventListener('input',function(){this.classList.remove('error');var e=document.getElementById(id+'Err');if(e)e.classList.remove('show');});
});
function buildReview(){
  var itemsHtml=cartItems.map(function(i){
    return '<div class="co-sum-item"><div class="co-sum-item-left"><span class="co-sum-emoji">'+escH(i.e)+'</span><span class="co-sum-name">'+escH(i.n)+'</span><span class="co-sum-qty">&times;'+i.qty+'</span></div><span class="co-sum-price">'+fmt(i.p*i.qty)+'</span></div>';
  }).join('');
  document.getElementById('coSummaryBlock').innerHTML='<div class="co-sum-title">Order Summary</div><div class="co-sum-items">'+itemsHtml+'</div><div class="co-sum-divider"></div><div class="co-sum-total"><span>Total</span><span>'+fmt(cartTotal())+'</span></div>';
  document.getElementById('coReviewDetails').innerHTML=[
    ['👤 Name',document.getElementById('coName').value],
    ['📞 Phone',document.getElementById('coPhone').value],
    ['✉️ Email',document.getElementById('coEmail').value],
    ['📍 Address',document.getElementById('coAddress').value],
    ['🗺️ State',document.getElementById('coState').value],
  ].map(function(pair){return '<div style="display:flex;gap:8px;font-size:13px"><span style="color:#868686;width:90px;flex-shrink:0">'+pair[0]+'</span><strong>'+escH(pair[1])+'</strong></div>';}).join('');
}
function buildPaySummary(){
  document.getElementById('coPaySummary').innerHTML='<div class="co-sum-title">Order Total</div><div class="co-sum-divider"></div><div class="co-sum-total" style="font-size:20px"><span>Amount to pay</span><span style="color:#ed6436">'+fmt(cartTotal())+'</span></div>';
}
function getLoggedInUser(){
  var raw=localStorage.getItem('sb-fsrkzhknqonpjjkjwqlw-auth-token');
  if(!raw)return null;
  try{var u=JSON.parse(raw)&&JSON.parse(raw).user;if(!u)return null;return{id:u.id,name:(u.user_metadata&&u.user_metadata.name)||u.email.split('@')[0],email:u.email,phone:(u.user_metadata&&u.user_metadata.phone)||''};}catch(e){return null;}
}
async function saveOrderToSupabase(ref){
  if(!_supabase)return;
  try{
    var order={reference:ref,status:'processing',customer_name:document.getElementById('coName').value,email:document.getElementById('coEmail').value,phone:document.getElementById('coPhone').value,address:document.getElementById('coAddress').value+', '+document.getElementById('coState').value,notes:document.getElementById('coNotes').value||'',items:cartItems.map(function(i){return{id:i.id,n:i.n,e:i.e,p:i.p,qty:i.qty};}),total:cartTotal()};
    var user=getLoggedInUser();if(user)order.user_id=user.id;
    await _supabase.from('orders').insert(order);
  }catch(e){console.warn('Order save failed:',e.message);}
}
function launchPaystack(){
  var btnNext=document.getElementById('coBtnNext'),spinner=document.getElementById('coSpinner'),btnLbl=document.getElementById('coBtnLabel');
  btnNext.disabled=true;spinner.classList.add('show');btnLbl.textContent='Opening payment…';
  var ref='PP-'+Date.now()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
  document.getElementById('coOrderRef').textContent=ref;
  PaystackPop.setup({
    key:PAYSTACK_PUBLIC_KEY,email:document.getElementById('coEmail').value,
    amount:cartTotal()*100,currency:'NGN',ref:ref,
    metadata:{custom_fields:[
      {display_name:'Customer Name',variable_name:'name',value:document.getElementById('coName').value},
      {display_name:'Phone',variable_name:'phone',value:document.getElementById('coPhone').value},
      {display_name:'Address',variable_name:'address',value:document.getElementById('coAddress').value},
      {display_name:'State',variable_name:'state',value:document.getElementById('coState').value},
    ]},
    callback:function(response){saveOrderToSupabase(ref);sendToN8n(ref,response.transaction);},
    onClose:function(){btnNext.disabled=false;spinner.classList.remove('show');btnLbl.textContent='🔒 Pay Now — '+fmt(cartTotal());}
  }).openIframe();
}
async function sendToN8n(ref,transactionId){
  try{
    await fetch(N8N_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reference:ref,transaction_id:transactionId||'N/A',timestamp:new Date().toISOString(),customer:{name:document.getElementById('coName').value,phone:document.getElementById('coPhone').value,email:document.getElementById('coEmail').value,address:document.getElementById('coAddress').value,state:document.getElementById('coState').value,notes:document.getElementById('coNotes').value||''},items:cartItems.map(function(i){return{id:i.id,name:i.n,category:i.cat,price:i.p,quantity:i.qty,subtotal:i.p*i.qty};}),total:cartTotal(),currency:'NGN',source:'puppyplace.ng'})});
  }catch(e){console.warn('n8n webhook failed:',e.message);}
  coCurrentStep=4;renderCoStep(4);cartItems=[];saveCart();updateBadges();renderCartDrawer();
}
function goSearch(){var q=document.getElementById('mobSI').value.trim();window.location.href='/shop.html'+(q?'?q='+encodeURIComponent(q):'');}
try{updateBadges();renderCartDrawer();renderWishDrawer();}catch(e){console.error('[PuppyPlace] Cart init error:',e);}
</script>
</body>
</html>`;
}

function productNotFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Product Not Found — PuppyPlace</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet"/>
<style>body{font-family:'Nunito',sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{font-size:32px;font-weight:900;margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{display:inline-block;background:#ed6436;color:#fff;border-radius:50px;padding:14px 32px;font-weight:800}</style>
</head><body><div style="font-size:72px;margin-bottom:20px">📦</div><h1>Product Not Found</h1><p>This product may have been removed or is no longer available.</p><a href="/shop.html">Browse All Products</a></body></html>`;
}

function productErrorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Error — PuppyPlace</title>
<style>body{font-family:sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{color:#ed6436;font-weight:700}</style>
</head><body><h1>⚠️ ${esc(msg)}</h1><p>Please try again later.</p><a href="/shop.html">← Back to Shop</a></body></html>`;
}
