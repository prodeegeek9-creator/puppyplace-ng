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
