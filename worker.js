import BLOG_TEMPLATE from './templates/blog.html';
import PETS_TEMPLATE from './templates/pets.html';
import { renderPetCard, ageWeeks, MAIN_TYPES } from './pet-cards.js';

export default {
  // Nightly (wrangler.jsonc → triggers): clear posted social videos out of storage.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deleteOldVideos(cleanEnv(env)).then(
      (r) => console.log(`old videos: ${r.deleted} deleted (${Math.round(r.bytes / 1e6)} MB), ${r.kept} kept`),
      (err) => console.error('old videos not deleted:', err?.message ?? err),
    ));
  },

  async fetch(request, env, ctx) {
    env = cleanEnv(env);
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
      return handleHeroUpload(request, url, env, ctx);
    }
    if (url.pathname === '/api/pets' && request.method === 'GET') return handlePublicPets(env);
    if (url.pathname.startsWith('/img/') && (request.method === 'GET' || request.method === 'HEAD')) return handleImage(request, url, env, ctx);
    if (url.pathname === '/api/admin/data' && request.method === 'POST') return handleAdminData(request, env);
    if (url.pathname === '/api/admin/shrink-photos' && request.method === 'POST') return handleAdminShrink(request, env);
    if (url.pathname === '/api/admin/pets' && request.method === 'POST') return handleAdminPets(request, env);

    // Seller accounts: log in with a WhatsApp code or the link the assistant sends,
    // see your listings and ask for changes (reviewed in Admin → Edit requests)
    if (url.pathname === '/api/auth/code' && request.method === 'POST') return handleAuthCode(request, url, env);
    if (url.pathname === '/api/auth/verify' && request.method === 'POST') return handleAuthVerify(request, url, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return handleLogout();
    if (url.pathname === '/login-link' && (request.method === 'GET' || request.method === 'POST')) return handleLoginLink(request, url, env);
    if (url.pathname === '/api/me' && request.method === 'GET') return handleMe(request, env);
    if (url.pathname === '/api/me/edit' && request.method === 'POST') return handleMeEdit(request, url, env, ctx);
    if (url.pathname === '/api/me/photo' && request.method === 'POST') return handleMePhoto(request, url, env, ctx);
    if (url.pathname === '/api/admin/edits' && request.method === 'POST') return handleAdminEdits(request, env, ctx);
    if (url.pathname === '/api/contact' && request.method === 'GET') return handleContact(request, url, env, ctx);
    if (url.pathname === '/api/dm/send' && request.method === 'POST') return handleDmSend(request, url, env, ctx);
    if (url.pathname === '/api/dm/threads' && request.method === 'GET') return handleDmThreads(request, env);
    if (url.pathname === '/api/dm/unread' && request.method === 'GET') return handleDmUnread(request, env);
    if (url.pathname === '/api/dm/thread' && request.method === 'GET') return handleDmThread(request, url, env);
    if (url.pathname === '/api/dm/report' && request.method === 'POST') return handleDmReport(request, url, env, ctx);
    if (url.pathname === '/api/admin/messages' && request.method === 'POST') return handleAdminMessages(request, env);

    // Pet listings sent in by sellers through Vendwyze; saved hidden until approved in admin
    if (url.pathname === '/api/seller-listings' && request.method === 'POST') {
      return handleSellerListing(request, env, ctx);
    }

    // A breed guide written by the listing assistant (a draft until approved in Admin → Breed guides)
    if (url.pathname === '/api/breed-guides' && request.method === 'POST') {
      return handleBreedGuideSubmit(request, env);
    }
    // The admin's list, edits and approvals of those guides
    if (url.pathname === '/api/breed-guides/admin' && request.method === 'POST') {
      return handleBreedGuideAdmin(request, env);
    }

    // Which of these seller listings has the store approved? Asked by Vendwyze, which tells the sellers.
    if (url.pathname === '/api/seller-listings/status' && request.method === 'GET') {
      return handleSellerListingStatus(request, url, env);
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

    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return handleStats(request, url, env);
    }

    // Page views are reported by the page's own script once it runs in a
    // browser, so crawlers and scanners that never execute JS aren't counted
    if (url.pathname === '/api/track-view' && request.method === 'POST') {
      return handleTrackView(request, url, env, ctx);
    }

    if (url.pathname === '/api/track-time' && request.method === 'POST') {
      return handleTrackTime(request, env);
    }

    // Wishlist adds, cart adds, checkout starts and WhatsApp clicks, for the admin dashboard
    if (url.pathname === '/api/track-event' && request.method === 'POST') {
      return handleTrackEvent(request, url, env, ctx);
    }

    // The admin dashboard's numbers, and the order list with its status changes
    if (url.pathname === '/api/admin/overview' && request.method === 'POST') {
      return handleAdminOverview(request, env);
    }
    if (url.pathname === '/api/admin/orders' && request.method === 'POST') {
      return handleAdminOrders(request, env);
    }
    if (url.pathname === '/api/admin/tracking-check' && request.method === 'POST') {
      return handleTrackingCheck(request, env);
    }

    if (url.pathname === '/api/blog-posts' && request.method === 'GET') {
      return handleBlogPosts(url, env);
    }

    if (url.pathname === '/sitemap.xml') {
      return serveSitemap(env);
    }

    // Image proxy for OG tags — re-serves Supabase images through Cloudflare
    // so social crawlers (WhatsApp etc.) hit a fast, trusted origin with clean headers
    if (url.pathname === '/api/og-img') {
      return handleOgImageProxy(request, url, env, ctx);
    }

    const petsPage = matchPetsPage(url.pathname);
    if (petsPage) {
      if (petsPage.redirect) return Response.redirect(`https://puppyplace.ng${petsPage.redirect}${url.search}`, 301);
      if (petsPage.notFound) return notFound(url, env);
      return servePetsPage(petsPage, env);
    }

    const petMatch = url.pathname.match(/^\/pets\/([^/]+?)(?:\.html)?$/);
    if (petMatch) {
      return servePetPage(decodeURIComponent(petMatch[1]), env);
    }

    if (url.pathname === '/blog.html') {
      return serveBlogIndex(url, env, null);
    }
    if (url.pathname === '/blog' || url.pathname === '/blog/') {
      return Response.redirect(`https://puppyplace.ng/blog.html${url.search}`, 301);
    }
    const blogCatMatch = url.pathname.match(/^\/blog\/([a-z0-9-]+)(?:\.html)?$/);
    if (blogCatMatch) {
      const cat = BLOG_CATS.find(c => c.slug === blogCatMatch[1]);
      if (!cat) return notFound(url, env);
      if (!url.pathname.endsWith('.html')) return Response.redirect(`https://puppyplace.ng${blogCatPath(cat)}${url.search}`, 301);
      return serveBlogIndex(url, env, cat);
    }

    const postMatch = url.pathname.match(/^\/posts\/([^/]+?)(?:\.html)?$/);
    if (postMatch) {
      let slug;
      try { slug = decodeURIComponent(postMatch[1]); } catch { slug = postMatch[1]; }
      return servePost(slug, env);
    }

    const productMatch = url.pathname.match(/^\/product\/(.+?)(?:\.html)?$/);
    if (productMatch) {
      return serveProduct(decodeURIComponent(productMatch[1]), env);
    }

    if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    // html_handling is "none", so .html pages are served as-is (matching the
    // canonical links and sitemap); the home page and old extensionless
    // addresses are handled here
    if (url.pathname === '/') {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
    }
    const bare = url.pathname.replace(/\/+$/, '');
    if (bare === '/index') return Response.redirect('https://puppyplace.ng/', 301);
    if (/^\/[a-z0-9-]+$/i.test(bare)) {
      const target = new URL(`${bare}.html${url.search}`, url.origin);
      const probe = await env.ASSETS.fetch(new Request(target));
      if (probe.ok) return Response.redirect(`https://puppyplace.ng${bare}.html${url.search}`, 301);
    }
    return notFound(url, env);
  },
};

async function notFound(url, env) {
  const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url.origin)));
  return new Response(page.body, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Secrets pasted into the dashboard can carry stray whitespace or a trailing
// slash. supabase-js tolerates both in the browser; raw fetch() here does not
// (".../rest/v1" becomes "//rest/v1" and every server-side query fails).
function cleanEnv(env) {
  const trim = v => (typeof v === 'string' ? v.trim() : v);
  return Object.assign({}, env, {
    SUPABASE_URL:         (trim(env.SUPABASE_URL) || '').replace(/\/+$/, ''),
    SUPABASE_ANON:        trim(env.SUPABASE_ANON),
    SUPABASE_SERVICE_KEY: trim(env.SUPABASE_SERVICE_KEY),
  });
}

// Link path for a blog post; falls back to the id for posts saved without a slug
function postPath(p) {
  return `/posts/${encodeURIComponent(String(p.slug || p.id || ''))}.html`;
}

// Canonical link path for a product (matches the sitemap)
function productPath(p) {
  return `/product/${encodeURIComponent(String(p.slug || p.id || ''))}.html`;
}

function shouldTrack(pathname) {
  if (typeof pathname !== 'string' || pathname.length > 300) return false;
  if (pathname.startsWith('/api/')) return false;
  if (['/admin.html', '/404.html', '/404'].includes(pathname)) return false;
  if (pathname === '/') return true;
  if (pathname.endsWith('.html')) return true;
  return /^\/(pets|posts|product)\/[^/]+$/.test(pathname);
}

// Crawlers, link previews, monitors, scripts and headless browsers
const BOT_UA = /bot|crawl|spider|slurp|scrap|fetch|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|skypeuripreview|pinterestbot|embedly|mediapartners|adsbot|google-inspectiontool|google-read-aloud|feedfetcher|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|statuscake|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|httpie|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|perl|ruby|php|scrapy|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|yandex|baidu|sogou|gptbot|chatgpt|claude|anthropic|perplexity|amazonbot|applebot|ccbot|dataforseo|censys|zgrab|masscan|nmap|nuclei/i;

// Cloud and hosting networks: real shoppers don't browse from these, but
// bots that fake a browser user agent usually run on them
const DATACENTER_ORG = /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|linode|ovh|hetzner|vultr|contabo|leaseweb|alibaba|tencent|huawei cloud|oracle|scaleway|choopa|m247|datacamp|hostinger|ionos|hostroyale|colocrossing|psychz|quadranet|servers\.com|tzulo|g-core|cdn77|zenlayer/i;

function isLikelyBot(request) {
  return botReason(request) !== null;
}

// Why a request is taken for a bot, or null. Also shown by the admin's tracking check.
// { vpnOk: true } lets data centre and VPN networks through: used for wishlist,
// cart and checkout events, which only a person tapping a button sends, while
// page views from those networks are mostly crawlers.
function botReason(request, { vpnOk = false } = {}) {
  const ua = request.headers.get('User-Agent') || '';
  if (!ua) return 'no browser name (User-Agent)';
  const m = ua.match(BOT_UA);
  if (m) return `the browser name contains "${m[0]}"`;
  // Every real browser sends Accept-Language; most scripts don't
  if (!request.headers.get('Accept-Language')) return 'no Accept-Language header';
  const cf = request.cf || {};
  const bm = cf.botManagement;
  if (bm && bm.verifiedBot) return 'Cloudflare says it is a known bot';
  if (bm && typeof bm.score === 'number' && bm.score < 30) return `Cloudflare bot score ${bm.score}`;
  if (!vpnOk && cf.asOrganization && DATACENTER_ORG.test(cf.asOrganization)) return `the network is a data centre or VPN (${cf.asOrganization})`;
  return null;
}

async function handleTrackView(request, url, env, ctx) {
  const ok = new Response(null, { status: 204 });
  try {
    if (isLikelyBot(request)) return ok;
    // Beacons only come from our own pages
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).hostname !== url.hostname) return ok;
    const { path, ref } = JSON.parse(await request.text());
    if (!shouldTrack(path)) return ok;
    const ip   = request.headers.get('CF-Connecting-IP') || '';
    const date = new Date().toISOString().slice(0, 10);
    const referrer = extractReferrer(typeof ref === 'string' ? ref : '', url.hostname);
    ctx.waitUntil(
      hashVisitor(ip, date).then(hash => trackView(path, request.cf?.country, hash, referrer, env))
    );
  } catch { /* non-critical */ }
  return ok;
}

function extractReferrer(refHeader, ownHost) {
  if (!refHeader) return null;
  try {
    const { hostname } = new URL(refHeader);
    const clean = hostname.replace(/^www\./, '');
    if (clean === ownHost || clean === 'puppyplace.ng') return null; // self-referral
    return clean;
  } catch { return null; }
}

async function hashVisitor(ip, date) {
  if (!ip) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + '|' + date));
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function trackView(path, country, visitorHash, referrer, env) {
  if (!env.SUPABASE_URL) return;
  const normalPath = path === '/index.html' ? '/' : path;
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/page_views`, {
      method: 'POST',
      headers: { ...sbHeaders(env), 'Prefer': 'return=minimal' },
      body: JSON.stringify({ path: normalPath, country: country || null, visitor_hash: visitorHash || null, referrer: referrer || null }),
    });
  } catch { /* non-critical */ }
}

async function handleTrackTime(request, env) {
  // Always respond immediately — this is fire-and-forget from the browser
  const ok = new Response('ok', { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (!env.SUPABASE_URL) return ok;
  try {
    if (isLikelyBot(request)) return ok;
    const { path: rawPath, secs } = await request.json();
    if (!rawPath || typeof secs !== 'number' || secs < 2 || secs > 86400) return ok;
    const path = rawPath === '/index.html' ? '/' : rawPath;
    const ip   = request.headers.get('CF-Connecting-IP') || '';
    const date = new Date().toISOString().slice(0, 10);
    const hash = await hashVisitor(ip, date);
    if (!hash) return ok;
    // PATCH the most recent matching row for this visitor + path today
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/page_views?visitor_hash=eq.${hash}&path=eq.${encodeURIComponent(path)}&viewed_at=gte.${date}T00:00:00.000Z&order=viewed_at.desc&limit=1`,
      { method: 'PATCH', headers: { ...sbHeaders(env), 'Prefer': 'return=minimal' }, body: JSON.stringify({ duration_seconds: secs }) }
    );
  } catch { /* non-critical */ }
  return ok;
}

// ── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
// supabase/admin_dashboard.sql makes the shop_events table and the admin_overview
// function these use. Until it has been run the dashboard says so, and the
// shop carries on as before.

const TRACKED_EVENTS = new Set(['wishlist_add', 'cart_add', 'checkout_start', 'whatsapp_click']);

// POST /api/track-event  { event, id?, name?, price?, path? }  → 204 whatever happens
async function handleTrackEvent(request, url, env, ctx) {
  const ok = new Response(null, { status: 204 });
  try {
    if (!env.SUPABASE_URL || botReason(request, { vpnOk: true }) !== null) return ok;
    // Beacons only come from our own pages
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).hostname !== url.hostname) return ok;
    const raw = await request.text();
    if (raw.length > 2000) return ok;
    const b = JSON.parse(raw);
    if (!TRACKED_EVENTS.has(b?.event)) return ok;
    const price = Number(b.price);
    const path = cleanText(b.path, 200);
    if (path && !shouldTrack(path)) return ok;
    const date = new Date().toISOString().slice(0, 10);
    const hash = await hashVisitor(request.headers.get('CF-Connecting-IP') || '', date);
    const row = {
      event: b.event,
      item_id: cleanText(b.id, 80),
      item_name: cleanText(b.name, 120),
      price: Number.isFinite(price) && price >= 0 && price < 1e9 ? price : null,
      path,
      visitor_hash: hash,
    };
    ctx.waitUntil(
      fetch(`${env.SUPABASE_URL}/rest/v1/shop_events`, {
        method: 'POST',
        headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      })
        .then(async (res) => { if (!res.ok) console.error('shop event not saved:', res.status, (await res.text()).slice(0, 300)); })
        .catch((err) => console.error('shop event not saved:', err?.message ?? err))
    );
  } catch { /* non-critical */ }
  return ok;
}

// POST /api/admin/overview  { token, days }  → the dashboard's numbers (admin_overview)
async function handleAdminOverview(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);

  const days = Math.min(90, Math.max(7, parseInt(b.days, 10) || 30));
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/admin_overview`, {
    method: 'POST',
    headers: sbHeaders(env),
    body: JSON.stringify({ days }),
  });
  if (!res.ok) {
    console.error('admin overview failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
    if (res.status === 404) {
      return jsonResp({ error: 'The dashboard is not set up yet. Run supabase/admin_dashboard.sql once in Supabase → SQL Editor.', setup: true }, 503);
    }
    return jsonResp({ error: 'Could not work out the numbers just now.' }, 502);
  }
  return jsonResp({ ok: true, overview: await res.json() }, 200);
}

// POST /api/admin/tracking-check  { token }
// Saves and removes a test event, and reports what was found: whether events can
// be saved (and the database's own error if not), whether this browser and
// network pass the bot filter, and the last events and page view recorded.
async function handleTrackingCheck(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured (SUPABASE_SERVICE_KEY is not set)' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);

  const h = sbHeaders(env);
  const base = `${env.SUPABASE_URL}/rest/v1`;
  const out = { filter: botReason(request), eventFilter: botReason(request, { vpnOk: true }), network: request.cf?.asOrganization || null, country: request.cf?.country || null };

  const ins = await fetch(`${base}/shop_events`, {
    method: 'POST',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ event: 'checkout_start', item_id: '__selftest__', item_name: 'Tracking self-test', path: '/' }),
  }).catch((err) => ({ ok: false, status: 0, text: async () => String(err?.message ?? err) }));
  out.save = { ok: ins.ok, status: ins.status, error: ins.ok ? null : (await ins.text().catch(() => '')).slice(0, 300) };
  if (ins.ok) await fetch(`${base}/shop_events?item_id=eq.__selftest__`, { method: 'DELETE', headers: h }).catch(() => {});

  const recent = await fetch(`${base}/shop_events?select=event,item_name,path,created_at&order=created_at.desc&limit=10`, { headers: { ...h, Prefer: 'count=exact' } }).catch(() => null);
  out.events = recent && recent.ok ? await recent.json() : null;
  out.eventTotal = recent && recent.ok ? Number((recent.headers.get('Content-Range') || '').split('/')[1]) || 0 : null;

  const pv = await fetch(`${base}/page_views?select=path,viewed_at&order=viewed_at.desc&limit=1`, { headers: h }).catch(() => null);
  out.lastView = pv && pv.ok ? (await pv.json())[0] || null : null;
  return jsonResp({ ok: true, check: out }, 200);
}

const ORDER_STATUSES = ['processing', 'shipped', 'delivered', 'cancelled'];

// POST /api/admin/orders  { token, action: 'list' | 'status', id, status }
async function handleAdminOrders(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);

  const h = sbHeaders(env);
  const base = `${env.SUPABASE_URL}/rest/v1/orders`;

  if (b.action === 'list') {
    const res = await fetch(`${base}?select=*&order=created_at.desc&limit=500`, { headers: h });
    if (!res.ok) return jsonResp({ error: 'Could not read the orders' }, 500);
    return jsonResp({ ok: true, orders: await res.json() }, 200);
  }

  if (b.action === 'status') {
    const id = String(b.id || '');
    if (!/^[0-9a-zA-Z-]{1,64}$/.test(id)) return jsonResp({ error: 'A valid order is required' }, 400);
    if (!ORDER_STATUSES.includes(b.status)) return jsonResp({ error: 'Unknown status' }, 400);
    const res = await fetch(`${base}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ status: b.status }),
    });
    if (!res.ok) return jsonResp({ error: 'Could not update the order' }, 500);
    if (!(await res.json()).length) return jsonResp({ error: 'Order not found' }, 404);
    return jsonResp({ ok: true }, 200);
  }

  return jsonResp({ error: 'Unknown action' }, 400);
}

// Returns headers using the service key when available, anon key as fallback
function sbHeaders(env) {
  return sbKeyHeaders(env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON);
}

// Anon (publishable) key first — for public data such as published blog posts,
// matching what the browser could already read
function sbPublicHeaders(env) {
  return sbKeyHeaders(env.SUPABASE_ANON || env.SUPABASE_SERVICE_KEY);
}

function sbKeyHeaders(key) {
  const h = { 'apikey': key, 'Content-Type': 'application/json' };
  // Legacy keys are JWTs and may also go in Authorization; the newer
  // sb_publishable_/sb_secret_ keys are rejected there, so send them in apikey only
  if (String(key || '').startsWith('eyJ')) h['Authorization'] = `Bearer ${key}`;
  return h;
}

// Admin only (the token from /api/admin-login, as "Authorization: Bearer …"),
// and only into hero-images.
async function handleHeroUpload(request, url, env, ctx) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return jsonResp({ error: 'Server not configured' }, 503);
  }
  const bearer = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!sameOrigin(request, url) || !(await verifyToken(bearer, env))) {
    return jsonResp({ error: 'Unauthorized. Log in to the admin again.' }, 401);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResp({ error: 'Invalid form data' }, 400);
  }

  const file   = formData.get('file');
  const bucket = 'hero-images';

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

  const ext  = PHOTO_TYPES[file.type];
  const path = `upload-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const key  = env.SUPABASE_SERVICE_KEY;

  const uploadRes = await fetch(
    `${env.SUPABASE_URL}/storage/v1/object/${bucket}/${path}`,
    {
      method:  'POST',
      headers: {
        'apikey':        key,
        'Authorization': `Bearer ${key}`,
        'Content-Type':  file.type,
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
  shrinkLater(ctx, env, [path]);
  return jsonResp({ url: publicUrl }, 200);
}

/* ── SELLER LISTINGS (Vendwyze gateway) ── */

const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish', 'Guinea Pig', 'Reptile', 'Other'];
const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // Vendwyze's own limit, so a photo it took is never refused here

// Nigerian numbers become +234…; other international numbers keep their digits
function normalizeWhatsapp(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = '234' + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = '234' + d;
  if (d.startsWith('2340')) d = '234' + d.slice(4); // "+234 0803…"
  if (d.startsWith('234') && d.length !== 13) return '';
  return d.length >= 10 && d.length <= 15 ? '+' + d : '';
}

function cleanText(v, max) {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

// Fetch a seller photo (https URL or data: URI) and copy it into Supabase storage,
// since WhatsApp media links expire
async function storeSellerPhoto(src, path, env) {
  let bytes, type;
  const dataUri = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(src));
  if (dataUri) {
    type = dataUri[1].toLowerCase();
    bytes = Uint8Array.from(atob(dataUri[2].replace(/\s/g, '')), c => c.charCodeAt(0));
  } else {
    let u;
    try { u = new URL(String(src)); } catch { throw new Error('not a valid URL'); }
    if (u.protocol !== 'https:') throw new Error('must be an https URL');
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    type = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (!PHOTO_TYPES[type]) throw new Error('not a JPEG, PNG, WebP, GIF or AVIF image');
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('larger than 8 MB');

  const key = env.SUPABASE_SERVICE_KEY;
  const file = `${path}.${PHOTO_TYPES[type]}`;
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/hero-images/${file}`, {
    method: 'POST',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': type, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!up.ok) throw new Error('storage upload failed');
  return `${env.SUPABASE_URL}/storage/v1/object/public/hero-images/${file}`;
}

async function handleSellerListing(request, env, ctx) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SELLER_API_KEY) {
    return jsonResp({ error: 'Server not configured' }, 503);
  }
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(auth, String(env.SELLER_API_KEY).trim())) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Body must be JSON' }, 400); }
  if (!b || typeof b !== 'object') return jsonResp({ error: 'Body must be a JSON object' }, 400);

  const breed = cleanText(b.breed, 80);
  const whatsapp = normalizeWhatsapp(b.whatsapp);
  const photos = Array.isArray(b.photos) ? b.photos.filter(Boolean) : [];
  const type = PET_TYPES.find(t => t.toLowerCase() === String(b.type || 'Dog').trim().toLowerCase()) || 'Other';
  const listingType = String(b.listing_type || 'sale').toLowerCase() === 'adoption' ? 'adoption' : 'sale';
  const price = b.price === undefined || b.price === null || b.price === '' ? null : Number(String(b.price).replace(/[^\d.]/g, ''));

  const errors = [];
  if (!breed) errors.push('breed is required');
  if (!whatsapp) errors.push('whatsapp must be a valid phone number');
  if (!photos.length) errors.push('at least one photo is required');
  if (photos.length > MAX_PHOTOS) errors.push(`at most ${MAX_PHOTOS} photos`);
  if (listingType === 'sale' && price !== null && !(price >= 0)) errors.push('price must be a number');
  if (errors.length) return jsonResp({ error: 'Invalid listing', details: errors }, 400);

  const h = sbHeaders(env);
  const base = env.SUPABASE_URL;

  // A seller who resends the same pet within 15 minutes gets the pending listing back
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  try {
    const dupRes = await fetch(
      `${base}/rest/v1/pets?whatsapp=eq.${encodeURIComponent(whatsapp)}&breed=ilike.${encodeURIComponent(breed)}&active=eq.false&created_at=gte.${since}&select=id,slug&limit=1`,
      { headers: h }
    );
    const dup = dupRes.ok ? await dupRes.json() : [];
    if (dup.length) return jsonResp({ ok: true, status: 'pending', duplicate: true, id: dup[0].id, slug: dup[0].slug }, 200);
  } catch { /* fall through and save */ }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const slug = `${breed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pet'}-${stamp}-${crypto.randomUUID().slice(0, 4)}`;

  const imageUrls = [];
  for (let i = 0; i < photos.length; i++) {
    try {
      imageUrls.push(await storeSellerPhoto(photos[i], `seller-pets/${slug}-${i + 1}`, env));
    } catch (e) {
      return jsonResp({ error: 'Invalid listing', details: [`photo ${i + 1}: ${e.message}`] }, 400);
    }
  }
  shrinkLater(ctx, env, imageUrls);

  const row = {
    slug,
    breed,
    name:         cleanText(b.name, 60),
    breeder:      cleanText(b.seller_name, 80),
    type,
    listing_type: listingType,
    pedigree:     ['pedigree', 'non-pedigree'].includes(String(b.pedigree || '').toLowerCase()) ? String(b.pedigree).toLowerCase() : null,
    price:        listingType === 'sale' ? price : null,
    age:          cleanText(b.age, 40),
    specs:        cleanText(b.description, 1500),
    location:     cleanText(b.location, 80),
    whatsapp,
    image_urls:   imageUrls,
    image_url:    imageUrls[0],
    dewormed:     b.dewormed === true,
    vaccinated:   b.vaccinated === true,
    active:       false,
  };
  // The WhatsApp number the listing was sent from, which WhatsApp itself has
  // confirmed: the seller's account. Kept apart from the pets table, which the
  // site reads openly (whatsapp above is the number buyers are given).
  const ownerPhone = phoneDigits(b.owner_phone);

  const ins = await fetch(`${base}/rest/v1/pets`, {
    method: 'POST',
    headers: { ...h, 'Prefer': 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!ins.ok) {
    // PostgREST answers in JSON with the useful part (message, hint) after a
    // long "details" row dump, so a plain slice can cut the reason off.
    const raw = await ins.text();
    let why = raw;
    try {
      const j = JSON.parse(raw);
      why = [j.message, j.hint, j.details].filter(Boolean).join(' — ') || raw;
    } catch { /* not JSON: keep the text */ }
    console.error('seller listing insert failed:', ins.status, raw.slice(0, 500));
    return jsonResp({ error: 'Could not save listing', details: [why.slice(0, 300)] }, 500);
  }
  const saved = (await ins.json())[0] || {};

  if (env.SELLER_ALERT_WEBHOOK) {
    ctx.waitUntil(fetch(env.SELLER_ALERT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pet_listing_pending', id: saved.id, slug, breed, pet_type: type, listing_type: listingType,
        price: row.price, location: row.location, seller_name: row.breeder, whatsapp, photo: imageUrls[0],
        review_url: 'https://puppyplace.ng/admin.html',
      }),
    }).catch(() => {}));
  }

  // Whether this breed already has a guide (draft, approved or turned down). If not,
  // Vendwyze writes one and sends it to /api/breed-guides.
  let breedGuide = 'unavailable';
  const key = breedKey(breed);
  if (key) {
    try {
      const g = await fetch(`${base}/rest/v1/breed_guides?breed_key=eq.${encodeURIComponent(key)}&select=breed_key&limit=1`, { headers: h });
      if (g.ok) breedGuide = (await g.json()).length ? 'exists' : 'missing';
    } catch { /* the guide is a bonus: the listing is saved either way */ }
  }

  // The seller's account, and a link to log in to it, for the chat they listed from.
  // Before supabase/seller_accounts.sql is run this quietly does nothing.
  let manageUrl = null;
  if (ownerPhone && saved.id != null && env.ADMIN_TOKEN_SECRET) {
    try {
      const own = await sbJson(env, 'pet_owners', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pet_id: String(saved.id), phone: ownerPhone }) });
      if (!own.ok) throw new Error(`owner not saved (${own.status})`);
      await upsertAccount(env, ownerPhone, { name: row.breeder, seller: true, login: false });
      manageUrl = await makeLoginLink(env, ownerPhone);
    } catch (err) { console.warn('seller account not made:', err?.message ?? err); }
  }

  return jsonResp({ ok: true, status: 'pending', id: saved.id, slug, url: `https://puppyplace.ng/pets/${slug}`, breed_guide: breedGuide, ...(manageUrl ? { manage_url: manageUrl } : {}) }, 201);
}

/* ── SELLER ACCOUNTS ───────────────────────────────────────────────────────
 * An account is a WhatsApp number. Sellers get one when their first listing
 * comes in through the WhatsApp assistant, with a one-tap link to log in; anyone
 * can log in later with a 6-digit code sent to their WhatsApp. Logged-in sellers
 * see their listings on /my-listings.html and ask for changes, which wait in
 * Admin → Edit requests until approved. Messages go out from the store's number
 * through Vendwyze (/api/pet-store/send, the shared key). Tables:
 * supabase/seller_accounts.sql.
 */

const VENDWYZE_DEFAULT = 'https://thrift-unique.prodeegeek9.workers.dev';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const LINK_DAYS = 7;
const SITE = 'https://puppyplace.ng';

// "0803 123 4567", "+234 803…" → "2348031234567"; '' when it is not a number.
const phoneDigits = (v) => normalizeWhatsapp(v).replace(/^\+/, '');

async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function vendwyzeUrl(env) {
  return String(env.VENDWYZE_URL || VENDWYZE_DEFAULT).replace(/\/+$/, '');
}

// WhatsApp somebody (or the store owner: { to: 'owner' }) from the store's number.
async function sendWhatsApp(env, { phone, to, text }) {
  if (!env.SELLER_API_KEY) return false;
  try {
    const res = await fetch(`${vendwyzeUrl(env)}/api/pet-store/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(env.SELLER_API_KEY).trim()}` },
      body: JSON.stringify(to === 'owner' ? { to: 'owner', text } : { phone, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) console.error('whatsapp send refused:', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error('whatsapp send failed:', err?.message ?? err);
    return false;
  }
}

// A session is signed like the admin's token but over a different message, so
// one can never be used as the other.
async function makeSession(env, accountId) {
  const expiry = String(Date.now() + SESSION_DAYS * 864e5);
  const sig = await hmacSign(`user|${accountId}|${expiry}`, env.ADMIN_TOKEN_SECRET);
  return `u1.${accountId}.${expiry}.${sig}`;
}

async function readSession(request, env) {
  if (!env.ADMIN_TOKEN_SECRET) return null;
  const m = /(?:^|;\s*)pp_s=([^;]+)/.exec(request.headers.get('Cookie') || '');
  if (!m) return null;
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length !== 4 || parts[0] !== 'u1') return null;
  const [, id, expiry, sig] = parts;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(Number(expiry) > Date.now())) return null;
  const expected = await hmacSign(`user|${id}|${expiry}`, env.ADMIN_TOKEN_SECRET);
  return safeEqual(expected, sig) ? id : null;
}

const sessionCookie = (token) => `pp_s=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
const CLEAR_COOKIE = 'pp_s=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

// Anything that changes state with the cookie must come from our own pages.
function sameOrigin(request, url) {
  const o = request.headers.get('Origin');
  if (!o) return true;
  try { return new URL(o).host === url.host; } catch { return false; }
}

function userJson(data, status = 200, cookie = null) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function accountsReady(env) {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && env.ADMIN_TOKEN_SECRET;
}

async function sbJson(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders(env), ...(init.headers || {}) } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

async function upsertAccount(env, phone, { name, seller, login = true } = {}) {
  const row = { phone, ...(login ? { last_login_at: new Date().toISOString() } : {}), ...(name ? { name } : {}), ...(seller ? { is_seller: true } : {}) };
  const r = await sbJson(env, 'pp_accounts?on_conflict=phone', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`account not saved (${r.status})`);
  return r.body[0];
}

async function accountById(env, id) {
  const r = await sbJson(env, `pp_accounts?id=eq.${id}&select=id,phone,name,is_seller,created_at&limit=1`);
  return r.ok ? r.body[0] || null : null;
}

// Where a login link may take you after logging in.
const safeNext = (v) => (/^\/(my-listings\.html|messages\.html(\?t=[0-9a-f-]{36})?)$/.test(String(v || '')) ? String(v) : null);

// A one-tap login link, sent in the person's WhatsApp chat: to their listings,
// or with next to a page such as one conversation.
async function makeLoginLink(env, phone, next = null) {
  const token = randomToken();
  const r = await sbJson(env, 'pp_login_links', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ token_hash: await sha256Hex(token), phone, expires_at: new Date(Date.now() + LINK_DAYS * 864e5).toISOString() }),
  });
  if (!r.ok) throw new Error(`link not saved (${r.status})`);
  const to = safeNext(next);
  return `${SITE}/login-link?t=${token}${to ? `&next=${encodeURIComponent(to)}` : ''}`;
}

// A seller's listings: the ones listed from their WhatsApp chat (pet_owners),
// and the ones that give their number to buyers (older listings have only that).
async function listingsFor(env, phone, select) {
  const own = await sbJson(env, `pet_owners?phone=eq.${phone}&select=pet_id&limit=200`);
  const ids = own.ok ? own.body.map((r) => r.pet_id) : [];
  const byNumber = `whatsapp.eq.${encodeURIComponent(`+${phone}`)}`;
  const filter = ids.length ? `or=(${byNumber},id.in.(${ids.map(encodeURIComponent).join(',')}))` : byNumber.replace('.eq.', '=eq.');
  const r = await sbJson(env, `pets?${filter}&select=${select}&order=created_at.desc&limit=200`);
  return r.ok && Array.isArray(r.body) ? r.body : [];
}

const LISTING_FIELDS = 'id,slug,breed,name,type,listing_type,price,age,location,specs,vaccinated,dewormed,pedigree,image_urls,image_url,active,created_at';

// POST /api/auth/code { phone }  → a 6-digit code on WhatsApp
async function handleAuthCode(request, url, env) {
  if (!accountsReady(env) || !env.SELLER_API_KEY) return userJson({ error: 'Log in is not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  let b;
  try { b = await request.json(); } catch { return userJson({ error: 'Invalid request' }, 400); }
  const phone = phoneDigits(b?.phone);
  if (!phone) return userJson({ error: 'Enter your WhatsApp number, like 0803 123 4567.' }, 400);

  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const ipHash = await hashVisitor(request.headers.get('CF-Connecting-IP') || '', new Date().toISOString().slice(0, 10));
  const recent = await sbJson(env, `pp_login_codes?phone=eq.${phone}&created_at=gte.${since}&select=id`);
  if (!recent.ok) return userJson({ error: 'Log in is not set up yet' }, 503);
  if (recent.body.length >= 3) return userJson({ error: 'Too many codes for this number. Try again in 15 minutes.' }, 429);
  if (ipHash) {
    const fromIp = await sbJson(env, `pp_login_codes?ip_hash=eq.${ipHash}&created_at=gte.${new Date(Date.now() - 3600e3).toISOString()}&select=id`);
    if (fromIp.ok && fromIp.body.length >= 10) return userJson({ error: 'Too many codes. Try again later.' }, 429);
  }

  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  const saved = await sbJson(env, 'pp_login_codes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      phone,
      code_hash: await sha256Hex(`${phone}:${code}:${env.ADMIN_TOKEN_SECRET}`),
      expires_at: new Date(Date.now() + CODE_MINUTES * 60e3).toISOString(),
      ip_hash: ipHash,
    }),
  });
  if (!saved.ok) return userJson({ error: 'Could not start the log in. Try again.' }, 500);

  const sent = await sendWhatsApp(env, {
    phone,
    text: `🔐 Your PuppyPlace code is *${code}*\n\nIt works for ${CODE_MINUTES} minutes. Don't share it with anyone: PuppyPlace will never ask you for it.`,
  });
  if (!sent) return userJson({ error: "We couldn't send a WhatsApp message to that number. Check it and try again." }, 502);
  return userJson({ ok: true });
}

// POST /api/auth/verify { phone, code }  → logged in (cookie)
async function handleAuthVerify(request, url, env) {
  if (!accountsReady(env)) return userJson({ error: 'Log in is not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  let b;
  try { b = await request.json(); } catch { return userJson({ error: 'Invalid request' }, 400); }
  const phone = phoneDigits(b?.phone);
  const code = String(b?.code ?? '').replace(/\D/g, '');
  const name = cleanText(b?.name, 60);
  if (!phone || code.length !== 6) return userJson({ error: 'Enter the 6-digit code from WhatsApp.' }, 400);

  const now = new Date().toISOString();
  const r = await sbJson(env, `pp_login_codes?phone=eq.${phone}&used_at=is.null&expires_at=gt.${now}&select=id,code_hash,attempts&order=created_at.desc&limit=1`);
  const row = r.ok ? r.body[0] : null;
  if (!row) return userJson({ error: 'That code has expired. Ask for a new one.' }, 400);
  if (row.attempts >= 5) return userJson({ error: 'Too many tries. Ask for a new code.' }, 429);

  const hash = await sha256Hex(`${phone}:${code}:${env.ADMIN_TOKEN_SECRET}`);
  if (!safeEqual(hash, row.code_hash)) {
    await sbJson(env, `pp_login_codes?id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attempts: row.attempts + 1 }) });
    return userJson({ error: "That code isn't right. Check the WhatsApp message and try again." }, 400);
  }
  await sbJson(env, `pp_login_codes?id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ used_at: now }) });

  let account;
  try { account = await upsertAccount(env, phone, { name }); } catch { return userJson({ error: 'Could not log you in. Try again.' }, 500); }
  return userJson({ ok: true, account: { name: account.name, phone: account.phone } }, 200, sessionCookie(await makeSession(env, account.id)));
}

// GET /login-link?t=…  A page with a button: WhatsApp and others open links to
// make previews, and a GET that logged in would spend the link on the preview.
// Referrer-Policy is same-origin, not no-referrer: with no-referrer the button's
// POST carries "Origin: null" and the same-site check turns it away. The page
// loads nothing from elsewhere, so the token in its address goes nowhere.
function loginLinkPage(token, message, next = null) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const to = safeNext(next) || '/my-listings.html';
  const msgs = to.startsWith('/messages');
  const body = message
    ? `<p>${esc(message)}</p><p><a class="btn" href="${esc(to)}">Log in with your WhatsApp number</a></p>`
    : `<p>Tap the button to open your ${msgs ? 'messages' : 'listings'} on PuppyPlace.</p>
       <form method="post" action="/login-link"><input type="hidden" name="t" value="${esc(token)}"/><input type="hidden" name="next" value="${esc(to)}"/><button class="btn" type="submit">Open my ${msgs ? 'messages' : 'listings'}</button></form>`;
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/><title>Log in | PuppyPlace</title>
<style>body{font-family:Nunito,system-ui,sans-serif;background:#f8f9fa;color:#1a1a18;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
.card{background:#fff;border-radius:16px;padding:28px;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:center}
h1{font-size:20px;margin:0 0 10px}p{color:#555;line-height:1.6}.btn{display:inline-block;background:#ed6436;color:#fff;border:0;border-radius:50px;padding:14px 26px;font:800 15px inherit;cursor:pointer;text-decoration:none}</style>
</head><body><div class="card"><h1>🐾 PuppyPlace</h1>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' } });
}

async function handleLoginLink(request, url, env) {
  if (request.method === 'GET') {
    const t = url.searchParams.get('t') || '';
    return loginLinkPage(t, t ? null : 'This link is not complete.', url.searchParams.get('next'));
  }
  const form = await request.formData().catch(() => null);
  const next = safeNext(form?.get('next')) || '/my-listings.html';
  if (!accountsReady(env)) return loginLinkPage('', 'Log in is not set up yet.', next);
  if (!sameOrigin(request, url)) return loginLinkPage('', 'Please open the link from WhatsApp again.', next);
  const token = String(form?.get('t') || '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return loginLinkPage('', 'This link is not valid.', next);
  const now = new Date().toISOString();
  const hash = await sha256Hex(token);
  const r = await sbJson(env, `pp_login_links?token_hash=eq.${hash}&used_at=is.null&expires_at=gt.${now}&select=phone&limit=1`);
  const link = r.ok ? r.body[0] : null;
  if (!link) return loginLinkPage('', 'This link has expired or was already used.', next);
  await sbJson(env, `pp_login_links?token_hash=eq.${hash}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ used_at: now }) });
  let account;
  try { account = await upsertAccount(env, link.phone); } catch { return loginLinkPage('', 'Could not log you in. Try again.', next); }
  return new Response(null, { status: 303, headers: { Location: next, 'Set-Cookie': sessionCookie(await makeSession(env, account.id)), 'Cache-Control': 'no-store' } });
}

async function handleLogout() {
  return userJson({ ok: true }, 200, CLEAR_COOKIE);
}

// GET /api/me → the account, its listings and its change requests
async function handleMe(request, env) {
  if (!accountsReady(env)) return userJson({ error: 'Log in is not set up yet' }, 503);
  const id = await readSession(request, env);
  const account = id ? await accountById(env, id) : null;
  if (!account) return userJson({ error: 'Not logged in' }, 401, id ? CLEAR_COOKIE : null);
  const listings = await listingsFor(env, account.phone, LISTING_FIELDS);
  const e = await sbJson(env, `pet_edits?account_id=eq.${account.id}&select=id,pet_id,kind,changes,status,note,created_at,decided_at&order=created_at.desc&limit=100`);
  // Views, WhatsApp chats and messages per listing (supabase/private_pets.sql); left out until it is set up.
  const st = listings.length
    ? await sbJson(env, 'rpc/pet_stats', { method: 'POST', body: JSON.stringify({ p_ids: listings.map((p) => String(p.id)) }) })
    : { ok: false };
  const stats = st.ok && Array.isArray(st.body) ? Object.fromEntries(st.body.map(({ pet_id, ...n }) => [pet_id, n])) : null;
  return userJson({ ok: true, account: { name: account.name, phone: account.phone }, listings, edits: e.ok ? e.body : [], stats });
}

// What a seller may change, cleaned the way a new listing is.
function cleanChanges(c, env) {
  const out = {};
  const errors = [];
  if (!c || typeof c !== 'object') return { out, errors: ['Nothing to change'] };
  if ('breed' in c) { const v = cleanText(c.breed, 80); v ? (out.breed = v) : errors.push('The breed cannot be empty.'); }
  if ('name' in c) out.name = cleanText(c.name, 60);
  if ('age' in c) out.age = cleanText(c.age, 40);
  if ('location' in c) out.location = cleanText(c.location, 80);
  if ('specs' in c) out.specs = cleanText(c.specs, 1500);
  if ('listing_type' in c) { ['sale', 'adoption'].includes(c.listing_type) ? (out.listing_type = c.listing_type) : errors.push('Choose for sale or adoption.'); }
  if ('price' in c) {
    if (c.price === null || c.price === '') out.price = null;
    else { const n = Number(String(c.price).replace(/[₦,\s]/g, '')); Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? (out.price = Math.round(n)) : errors.push('The price must be a number in naira.'); }
  }
  for (const k of ['vaccinated', 'dewormed']) if (k in c) out[k] = c[k] === true;
  if ('pedigree' in c) out.pedigree = ['pedigree', 'non-pedigree'].includes(c.pedigree) ? c.pedigree : null;
  if ('image_urls' in c) {
    const ours = `${env.SUPABASE_URL}/storage/v1/object/public/hero-images/`;
    const list = Array.isArray(c.image_urls) ? c.image_urls.filter((u) => typeof u === 'string') : [];
    if (!list.length) errors.push('Keep at least one photo.');
    else if (list.length > MAX_PHOTOS) errors.push(`At most ${MAX_PHOTOS} photos.`);
    else if (list.some((u) => !u.startsWith(ours))) errors.push('Photos must be uploaded here.');
    else out.image_urls = [...new Set(list)];
  }
  if (out.listing_type === 'adoption') out.price = null;
  return { out, errors };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// POST /api/me/edit { pet_id, kind: 'edit' | 'remove', changes, note }
async function handleMeEdit(request, url, env, ctx) {
  if (!accountsReady(env)) return userJson({ error: 'Log in is not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  const id = await readSession(request, env);
  const account = id ? await accountById(env, id) : null;
  if (!account) return userJson({ error: 'Not logged in' }, 401);
  let b;
  try { b = await request.json(); } catch { return userJson({ error: 'Invalid request' }, 400); }
  const pet = (await listingsFor(env, account.phone, LISTING_FIELDS)).find((p) => String(p.id) === String(b?.pet_id));
  if (!pet) return userJson({ error: 'That listing is not yours.' }, 404);
  const kind = b?.kind === 'remove' ? 'remove' : 'edit';
  const note = cleanText(b?.note, 300);

  let changes = {};
  if (kind === 'edit') {
    const { out, errors } = cleanChanges(b?.changes, env);
    if (errors.length) return userJson({ error: errors[0], details: errors }, 400);
    const current = { ...pet, image_urls: Array.isArray(pet.image_urls) && pet.image_urls.length ? pet.image_urls : pet.image_url ? [pet.image_url] : [] };
    for (const [k, v] of Object.entries(out)) if (!same(v, current[k])) changes[k] = v;
    if (!Object.keys(changes).length) return userJson({ error: 'Nothing has changed.' }, 400);
  }

  // One request per listing waits at a time: a newer one replaces it.
  const open = await sbJson(env, `pet_edits?pet_id=eq.${encodeURIComponent(pet.id)}&status=eq.pending&select=id&limit=1`);
  if (!open.ok) return userJson({ error: 'Editing is not set up yet' }, 503);
  const row = { pet_id: String(pet.id), account_id: account.id, kind, changes, note, created_at: new Date().toISOString() };
  const saved = open.body[0]
    ? await sbJson(env, `pet_edits?id=eq.${open.body[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
    : await sbJson(env, 'pet_edits', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!saved.ok) return userJson({ error: 'Could not save your request. Try again.' }, 500);

  const fields = Object.keys(changes).map((k) => (k === 'image_urls' ? 'photos' : k === 'specs' ? 'description' : k === 'listing_type' ? 'sale or adoption' : k));
  const list = fields.length > 1 ? `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}` : fields[0];
  const what = kind === 'remove' ? 'take down their' : `change the ${list} of their`;
  ctx.waitUntil(sendWhatsApp(env, { to: 'owner', text: `✏️ ${account.name || '+' + account.phone} asked to ${what} *${pet.breed}* listing. Review it in your site admin → Edit requests.` }));
  return userJson({ ok: true, edit: saved.body[0] });
}

// POST /api/me/photo (multipart: file) → { url }, for a photo in a change request
async function handleMePhoto(request, url, env, ctx) {
  if (!accountsReady(env)) return userJson({ error: 'Log in is not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  const id = await readSession(request, env);
  if (!id) return userJson({ error: 'Not logged in' }, 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return userJson({ error: 'No photo sent' }, 400);
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return userJson({ error: 'Send a JPEG, PNG or WebP photo.' }, 400);
  if (file.size > MAX_PHOTO_BYTES) return userJson({ error: 'That photo is larger than 8 MB.' }, 400);
  const path = `seller-pets/edits/${id}/${crypto.randomUUID()}.${ext}`;
  const key = env.SUPABASE_SERVICE_KEY;
  const up = await fetch(`${env.SUPABASE_URL}/storage/v1/object/hero-images/${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': file.type },
    body: await file.arrayBuffer(),
  });
  if (!up.ok) return userJson({ error: 'Could not upload that photo. Try again.' }, 500);
  shrinkLater(ctx, env, [path]);
  return userJson({ ok: true, url: `${env.SUPABASE_URL}/storage/v1/object/public/hero-images/${path}` });
}

// POST /api/admin/edits { token, action: 'list' | 'approve' | 'reject', id, note }
async function handleAdminEdits(request, env, ctx) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);

  if (b.action === 'list') {
    const e = await sbJson(env, 'pet_edits?status=eq.pending&select=id,pet_id,account_id,kind,changes,note,created_at&order=created_at.asc&limit=200');
    if (!e.ok) return jsonResp({ error: 'Edit requests are not set up yet. Run supabase/seller_accounts.sql once in Supabase → SQL Editor.', setup: true }, 503);
    const petIds = [...new Set(e.body.map((x) => x.pet_id))];
    const accIds = [...new Set(e.body.map((x) => x.account_id).filter(Boolean))];
    const pets = petIds.length ? await sbJson(env, `pets?id=in.(${petIds.map(encodeURIComponent).join(',')})&select=${LISTING_FIELDS},whatsapp,breeder`) : { body: [] };
    const accs = accIds.length ? await sbJson(env, `pp_accounts?id=in.(${accIds.join(',')})&select=id,name,phone`) : { body: [] };
    const petMap = new Map((pets.body || []).map((p) => [String(p.id), p]));
    const accMap = new Map((accs.body || []).map((a) => [a.id, a]));
    return jsonResp({ ok: true, edits: e.body.map((x) => ({ ...x, pet: petMap.get(String(x.pet_id)) || null, account: accMap.get(x.account_id) || null })) }, 200);
  }

  if (!/^[0-9a-f-]{36}$/.test(String(b.id || ''))) return jsonResp({ error: 'A valid request is required' }, 400);
  const e = await sbJson(env, `pet_edits?id=eq.${b.id}&status=eq.pending&select=id,pet_id,account_id,kind,changes&limit=1`);
  const edit = e.ok ? e.body[0] : null;
  if (!edit) return jsonResp({ error: 'That request is no longer waiting' }, 404);
  const petR = await sbJson(env, `pets?id=eq.${encodeURIComponent(edit.pet_id)}&select=id,slug,breed&limit=1`);
  const pet = petR.ok ? petR.body[0] : null;
  const acc = edit.account_id ? await accountById(env, edit.account_id) : null;
  const note = cleanText(b.note, 300);
  const decided = { decided_at: new Date().toISOString() };

  if (b.action === 'reject') {
    // The reason replaces the seller's note: it is what they see on My listings.
    await sbJson(env, `pet_edits?id=eq.${edit.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', ...decided, ...(note ? { note } : {}) }) });
    if (acc && pet) ctx.waitUntil(sendWhatsApp(env, { phone: acc.phone, text: `Your request for your *${pet.breed}* listing wasn't approved${note ? `: ${note}` : '.'}\n\nYou can try again from ${SITE}/my-listings.html` }));
    return jsonResp({ ok: true }, 200);
  }
  if (b.action !== 'approve') return jsonResp({ error: 'Unknown action' }, 400);
  if (!pet) {
    await sbJson(env, `pet_edits?id=eq.${edit.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'withdrawn', ...decided }) });
    return jsonResp({ error: 'That listing no longer exists' }, 404);
  }

  if (edit.kind === 'remove') {
    const d = await sbJson(env, `pets?id=eq.${encodeURIComponent(pet.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (!d.ok) return jsonResp({ error: 'Could not take the listing down' }, 500);
  } else {
    const patch = { ...edit.changes };
    if (Array.isArray(patch.image_urls)) patch.image_url = patch.image_urls[0];
    if (patch.listing_type === 'adoption') patch.price = null;
    const u = await sbJson(env, `pets?id=eq.${encodeURIComponent(pet.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    if (!u.ok) return jsonResp({ error: 'Could not apply the changes' }, 500);
  }
  await sbJson(env, `pet_edits?id=eq.${edit.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'approved', ...decided }) });
  if (acc) {
    const text = edit.kind === 'remove'
      ? `Your *${pet.breed}* listing has been taken down from PuppyPlace, as you asked.`
      : `✅ Your changes to your *${pet.breed}* listing are approved:\n${SITE}/pets/${pet.slug}`;
    ctx.waitUntil(sendWhatsApp(env, { phone: acc.phone, text }));
  }
  return jsonResp({ ok: true }, 200);
}

/* ── BUYERS: WHATSAPP CONTACT AND MESSAGES ─────────────────────────────────
 * A seller's WhatsApp number is no longer in the pet pages: a signed-in buyer
 * gets the chat link from /api/contact (signing in is a WhatsApp code, about
 * 20 seconds, on the pet page itself). Or the buyer sends a message on the site
 * (/api/dm/…): the seller is told on WhatsApp with a one-tap link to reply, and
 * the buyer the same way when they do; neither sees the other's number. Tables:
 * supabase/messages.sql.
 */

const DM_MAX = 1000;
const NEW_THREADS_PER_DAY = 10;
const MESSAGES_PER_HOUR = 30;
const CONTACTS_PER_HOUR = 30;
// Words that come before most pet scams in Nigeria: a deposit, a transfer, an account number.
const SCAM = /\b(deposit|pay(ment)? (first|before|upfront|now)|transfer|account (number|no|details)|acct|bank details|opay|palmpay|moniepoint|kuda|western union|delivery fee|caution fee|\d{10})\b/i;

async function sessionAccount(request, env) {
  const id = await readSession(request, env);
  return id ? accountById(env, id) : null;
}

async function petBySlug(env, slug) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(String(slug || ''))) return null;
  const r = await sbJson(env, `pets?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=id,slug,breed,name,type,whatsapp,breeder,image_url,image_urls&limit=1`);
  return r.ok ? r.body[0] || null : null;
}

// Who answers for a pet: the number it was listed from, else the one buyers were given.
async function sellerPhoneFor(env, pet) {
  const own = await sbJson(env, `pet_owners?pet_id=eq.${encodeURIComponent(pet.id)}&select=phone&limit=1`);
  return (own.ok && own.body[0]?.phone) || phoneDigits(pet.whatsapp) || null;
}

const firstName = (a) => (a?.name ? String(a.name).split(' ')[0] : 'A buyer');

// GET /api/contact?slug=…  → { url } for a signed-in buyer: the WhatsApp chat with the seller.
async function handleContact(request, url, env, ctx) {
  if (!accountsReady(env)) return userJson({ error: 'Not set up yet' }, 503);
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ error: 'Sign in to chat on WhatsApp', login: true }, 401);
  const pet = await petBySlug(env, url.searchParams.get('slug'));
  const wa = pet ? String(pet.whatsapp || '').replace(/\D/g, '') : '';
  if (!wa) return userJson({ error: 'This seller cannot be reached on WhatsApp. Send a message instead.' }, 404);

  const since = new Date(Date.now() - 3600e3).toISOString();
  const recent = await sbJson(env, `pet_leads?account_id=eq.${me.id}&created_at=gte.${since}&select=id`);
  if (recent.ok && recent.body.length >= CONTACTS_PER_HOUR) return userJson({ error: 'Too many in a short time. Try again later.' }, 429);
  ctx.waitUntil(sbJson(env, 'pet_leads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pet_id: String(pet.id), account_id: me.id, kind: 'whatsapp' }) }).catch(() => {}));
  ctx.waitUntil(sbJson(env, 'shop_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ event: 'whatsapp_click', path: `/pets/${pet.slug}`, item_id: String(pet.id), item_name: pet.breed }) }).catch(() => {}));

  const text = `Hi, I'm interested in the ${pet.breed}${pet.name ? ' (' + pet.name + ')' : ''} listed on PuppyPlace.ng: ${SITE}/pets/${pet.slug}`;
  return userJson({ ok: true, url: `https://wa.me/${wa}?text=${encodeURIComponent(text)}` });
}

// The other side is told on WhatsApp, with a one-tap link straight to the conversation.
async function tellAboutMessage(env, { phone, pet, from, body, threadId }) {
  let link = `${SITE}/messages.html?t=${threadId}`;
  try { link = await makeLoginLink(env, phone, `/messages.html?t=${threadId}`); } catch { /* the plain link still works after logging in */ }
  const quote = body.length > 160 ? body.slice(0, 157) + '…' : body;
  return sendWhatsApp(env, { phone, text: `💬 New message about the *${pet.breed}* from ${from}:\n\n"${quote}"\n\nReply here: ${link}` });
}

// POST /api/dm/send { slug } or { thread_id }, with { body }
async function handleDmSend(request, url, env, ctx) {
  if (!accountsReady(env)) return userJson({ error: 'Not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ error: 'Sign in to send a message', login: true }, 401);
  let b;
  try { b = await request.json(); } catch { return userJson({ error: 'Invalid request' }, 400); }
  const body = String(b?.body ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, DM_MAX);
  if (!body) return userJson({ error: 'Write a message first.' }, 400);

  const hour = new Date(Date.now() - 3600e3).toISOString();
  const mine = await sbJson(env, `pet_messages?sender_id=eq.${me.id}&created_at=gte.${hour}&select=id`);
  if (!mine.ok) return userJson({ error: 'Messages are not set up yet' }, 503);
  if (mine.body.length >= MESSAGES_PER_HOUR) return userJson({ error: 'You have sent a lot of messages. Try again in a while.' }, 429);

  let thread, role, pet;
  if (b?.thread_id) {
    if (!/^[0-9a-f-]{36}$/.test(String(b.thread_id))) return userJson({ error: 'Conversation not found' }, 404);
    const t = await sbJson(env, `pet_threads?id=eq.${b.thread_id}&select=*&limit=1`);
    thread = t.ok ? t.body[0] : null;
    if (!thread) return userJson({ error: 'Conversation not found' }, 404);
    role = thread.buyer_id === me.id ? 'buyer' : (await isSellerOf(env, me, thread)) ? 'seller' : null;
    if (!role) return userJson({ error: 'Conversation not found' }, 404);
    pet = { id: thread.pet_id, slug: thread.pet_slug, breed: thread.pet_breed };
  } else {
    pet = await petBySlug(env, b?.slug);
    if (!pet) return userJson({ error: 'That listing is not available.' }, 404);
    const sellerPhone = await sellerPhoneFor(env, pet);
    if (!sellerPhone) return userJson({ error: 'This seller cannot be reached here.' }, 404);
    if (sellerPhone === me.phone || phoneDigits(pet.whatsapp) === me.phone) return userJson({ error: 'This is your own listing.' }, 400);
    const t = await sbJson(env, `pet_threads?pet_id=eq.${encodeURIComponent(pet.id)}&buyer_id=eq.${me.id}&select=*&limit=1`);
    thread = t.ok ? t.body[0] : null;
    if (!thread) {
      const day = new Date(Date.now() - 864e5).toISOString();
      const started = await sbJson(env, `pet_threads?buyer_id=eq.${me.id}&created_at=gte.${day}&select=id`);
      if (started.ok && started.body.length >= NEW_THREADS_PER_DAY) return userJson({ error: 'You have messaged a lot of sellers today. Try again tomorrow.' }, 429);
      const made = await sbJson(env, 'pet_threads', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ pet_id: String(pet.id), pet_slug: pet.slug, pet_breed: pet.breed, buyer_id: me.id, seller_phone: sellerPhone }),
      });
      if (made.ok) {
        thread = made.body[0];
      } else {
        // Two first messages at once: the other one made the conversation.
        const again = await sbJson(env, `pet_threads?pet_id=eq.${encodeURIComponent(pet.id)}&buyer_id=eq.${me.id}&select=*&limit=1`);
        thread = again.ok ? again.body[0] : null;
        if (!thread) return userJson({ error: 'Could not start the conversation. Try again.' }, 500);
      }
      if (made.ok) ctx.waitUntil(sbJson(env, 'pet_leads', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ pet_id: String(pet.id), account_id: me.id, kind: 'message' }) }).catch(() => {}));
    }
    role = 'buyer';
  }

  const flagged = SCAM.test(body);
  const sent = await sbJson(env, 'pet_messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ thread_id: thread.id, sender: role, sender_id: me.id, body, flagged }),
  });
  if (!sent.ok) return userJson({ error: 'Could not send. Try again.' }, 500);

  // Only the first unread message sends a WhatsApp alert: a conversation in full
  // flow does not turn into a stream of notifications.
  const otherUnread = role === 'buyer' ? thread.seller_unread : thread.buyer_unread;
  const patch = {
    last_message_at: new Date().toISOString(),
    [role === 'buyer' ? 'seller_unread' : 'buyer_unread']: (otherUnread || 0) + 1,
    ...(flagged ? { flagged: true } : {}),
  };
  await sbJson(env, `pet_threads?id=eq.${thread.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  if (!otherUnread) {
    let phone = thread.seller_phone, from = firstName(me);
    if (role === 'seller') {
      const buyer = await accountById(env, thread.buyer_id);
      phone = buyer?.phone;
      from = 'the seller';
    }
    if (phone) ctx.waitUntil(tellAboutMessage(env, { phone, pet, from, body, threadId: thread.id }));
  }
  return userJson({ ok: true, thread_id: thread.id, message: sent.body[0], warn: flagged });
}

async function isSellerOf(env, me, thread) {
  if (thread.seller_phone === me.phone) return true;
  const mine = await listingsFor(env, me.phone, 'id');
  return mine.some((p) => String(p.id) === String(thread.pet_id));
}

// GET /api/dm/threads → every conversation I am in, as buyer or seller
async function handleDmThreads(request, env) {
  if (!accountsReady(env)) return userJson({ error: 'Not set up yet' }, 503);
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ error: 'Sign in to see your messages', login: true }, 401);
  const myPets = (await listingsFor(env, me.phone, 'id')).map((p) => encodeURIComponent(p.id));
  const or = [`buyer_id.eq.${me.id}`, `seller_phone.eq.${me.phone}`, ...(myPets.length ? [`pet_id.in.(${myPets.join(',')})`] : [])].join(',');
  const t = await sbJson(env, `pet_threads?or=(${or})&select=*&order=last_message_at.desc&limit=100`);
  if (!t.ok) return userJson({ error: 'Messages are not set up yet' }, 503);
  const ids = t.body.map((x) => x.id);
  const buyers = [...new Set(t.body.map((x) => x.buyer_id))];
  const last = ids.length ? await sbJson(env, `pet_messages?thread_id=in.(${ids.join(',')})&select=thread_id,body,sender,created_at&order=created_at.desc&limit=500`) : { body: [] };
  const people = buyers.length ? await sbJson(env, `pp_accounts?id=in.(${buyers.join(',')})&select=id,name`) : { body: [] };
  const petIds = [...new Set(t.body.map((x) => encodeURIComponent(x.pet_id)))];
  const pets = petIds.length ? await sbJson(env, `pets?id=in.(${petIds.join(',')})&select=id,image_url,breeder`) : { body: [] };
  const lastBy = new Map();
  for (const m of last.body || []) if (!lastBy.has(m.thread_id)) lastBy.set(m.thread_id, m);
  const nameOf = new Map((people.body || []).map((a) => [a.id, a.name]));
  const petOf = new Map((pets.body || []).map((p) => [String(p.id), p]));
  return userJson({
    ok: true,
    threads: t.body.map((x) => {
      const asBuyer = x.buyer_id === me.id;
      const p = petOf.get(String(x.pet_id));
      return {
        id: x.id, slug: x.pet_slug, breed: x.pet_breed, photo: p?.image_url || null, role: asBuyer ? 'buyer' : 'seller',
        with: asBuyer ? p?.breeder || 'The seller' : (nameOf.get(x.buyer_id) || 'A buyer'),
        unread: asBuyer ? x.buyer_unread : x.seller_unread, flagged: x.flagged, last: lastBy.get(x.id) || null, last_message_at: x.last_message_at,
      };
    }),
  });
}

// GET /api/dm/unread → { count } of conversations with something new for me (the
// message icon's badge). Free for visitors who aren't signed in: no cookie, no lookup.
async function handleDmUnread(request, env) {
  if (!accountsReady(env) || !/(?:^|;\s*)pp_s=/.test(request.headers.get('Cookie') || '')) return userJson({ count: 0 });
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ count: 0, signedIn: false });
  const myPets = (await listingsFor(env, me.phone, 'id')).map((p) => encodeURIComponent(p.id));
  const or = [`buyer_id.eq.${me.id}`, `seller_phone.eq.${me.phone}`, ...(myPets.length ? [`pet_id.in.(${myPets.join(',')})`] : [])].join(',');
  const t = await sbJson(env, `pet_threads?or=(${or})&select=buyer_id,buyer_unread,seller_unread&order=last_message_at.desc&limit=200`);
  const count = t.ok ? t.body.filter((x) => (x.buyer_id === me.id ? x.buyer_unread : x.seller_unread) > 0).length : 0;
  return userJson({ count, signedIn: true });
}

// GET /api/dm/thread?id=… → the messages, and marks them read for me
async function handleDmThread(request, url, env) {
  if (!accountsReady(env)) return userJson({ error: 'Not set up yet' }, 503);
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ error: 'Sign in to see your messages', login: true }, 401);
  const id = url.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return userJson({ error: 'Conversation not found' }, 404);
  const t = await sbJson(env, `pet_threads?id=eq.${id}&select=*&limit=1`);
  const thread = t.ok ? t.body[0] : null;
  const role = !thread ? null : thread.buyer_id === me.id ? 'buyer' : (await isSellerOf(env, me, thread)) ? 'seller' : null;
  if (!role) return userJson({ error: 'Conversation not found' }, 404);
  const m = await sbJson(env, `pet_messages?thread_id=eq.${id}&select=id,sender,body,flagged,created_at&order=created_at.asc&limit=500`);
  const unread = role === 'buyer' ? 'buyer_unread' : 'seller_unread';
  if (thread[unread]) await sbJson(env, `pet_threads?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [unread]: 0 }) });
  const other = role === 'seller' ? await accountById(env, thread.buyer_id) : null;
  const pet = await sbJson(env, `pets?id=eq.${encodeURIComponent(thread.pet_id)}&select=breeder,image_url,active&limit=1`);
  return userJson({
    ok: true,
    thread: { id, slug: thread.pet_slug, breed: thread.pet_breed, role, flagged: thread.flagged, reported: Boolean(thread.reported_at), photo: pet.body?.[0]?.image_url || null, live: pet.body?.[0]?.active === true,
      with: role === 'buyer' ? pet.body?.[0]?.breeder || 'The seller' : other?.name || 'A buyer' },
    messages: (m.body || []).map((x) => ({ ...x, mine: x.sender === role })),
  });
}

// POST /api/dm/report { thread_id, reason }
async function handleDmReport(request, url, env, ctx) {
  if (!accountsReady(env)) return userJson({ error: 'Not set up yet' }, 503);
  if (!sameOrigin(request, url)) return userJson({ error: 'Forbidden' }, 403);
  const me = await sessionAccount(request, env);
  if (!me) return userJson({ error: 'Sign in first', login: true }, 401);
  const b = await request.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(String(b?.thread_id || ''))) return userJson({ error: 'Conversation not found' }, 404);
  const t = await sbJson(env, `pet_threads?id=eq.${b.thread_id}&select=*&limit=1`);
  const thread = t.ok ? t.body[0] : null;
  if (!thread || !(thread.buyer_id === me.id || (await isSellerOf(env, me, thread)))) return userJson({ error: 'Conversation not found' }, 404);
  const reason = cleanText(b?.reason, 300) || 'No reason given';
  await sbJson(env, `pet_threads?id=eq.${thread.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reported_at: new Date().toISOString(), report_reason: reason }) });
  ctx.waitUntil(sendWhatsApp(env, { to: 'owner', text: `🚩 A conversation about the *${thread.pet_breed}* was reported: "${reason}". See it in your site admin → Messages.` }));
  return userJson({ ok: true });
}

// POST /api/admin/messages { token, action: 'list' | 'thread', id }
async function handleAdminMessages(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);
  if (b.action === 'thread') {
    if (!/^[0-9a-f-]{36}$/.test(String(b.id || ''))) return jsonResp({ error: 'A valid conversation is required' }, 400);
    const m = await sbJson(env, `pet_messages?thread_id=eq.${b.id}&select=sender,body,flagged,created_at&order=created_at.asc&limit=500`);
    return jsonResp({ ok: true, messages: m.body || [] }, 200);
  }
  const t = await sbJson(env, 'pet_threads?select=*&order=last_message_at.desc&limit=200');
  if (!t.ok) return jsonResp({ error: 'Messages are not set up yet. Run supabase/messages.sql once in Supabase → SQL Editor.', setup: true }, 503);
  const buyers = [...new Set(t.body.map((x) => x.buyer_id))];
  const people = buyers.length ? await sbJson(env, `pp_accounts?id=in.(${buyers.join(',')})&select=id,name,phone`) : { body: [] };
  const who = new Map((people.body || []).map((a) => [a.id, a]));
  const rank = (x) => (x.reported_at ? 0 : x.flagged ? 1 : 2);
  const threads = t.body.map((x) => ({ ...x, buyer: who.get(x.buyer_id) || null })).sort((a, z) => rank(a) - rank(z));
  return jsonResp({ ok: true, threads }, 200);
}

/* ── IMAGES THROUGH CLOUDFLARE ───────────────────────────────────────────
 * Every photo on the site is in Supabase storage (hero-images), and the free
 * plan allows 5 GB of downloads a month. /img/<path> serves the same file from
 * Cloudflare's cache, which costs nothing: Supabase sends each photo once per
 * Cloudflare location a month instead of once per visitor. Pages, the pet and
 * blog APIs and the home and shop pages' product data all point here.
 */
const IMG_BUCKET = 'hero-images';
const IMG_CACHE_SECONDS = 30 * 86400;
const SUPABASE_IMG = /https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/hero-images\//g;

// Supabase photo links in a page or JSON → the cached ones on our domain.
const viaCdn = (text) => String(text).replace(SUPABASE_IMG, 'https://puppyplace.ng/img/');

// Photos are sent resized: ?w= one of IMG_WIDTHS (cards ask for 600; anything
// else gets 1200), as WebP when the browser takes it. The resizing is done by
// wsrv.nl (also used for link previews) from the Supabase original; if it fails
// the original is sent and kept for a day only, so the next visit tries again.
const IMG_WIDTHS = [200, 400, 600, 800, 1200, 1600];
const IMG_DEFAULT_WIDTH = 1200;
const IMG_RESIZABLE = /\.(jpe?g|png|webp)$/i;

async function handleImage(request, url, env, ctx) {
  const path = url.pathname.slice('/img/'.length);
  if (!env.SUPABASE_URL || !path || path.includes('..') || !/^[\w\-./%@()+ ]+$/.test(decodeURIComponent(path))) {
    return new Response('Not found', { status: 404 });
  }
  const asked = Number(url.searchParams.get('w'));
  const width = IMG_WIDTHS.includes(asked) ? asked : IMG_DEFAULT_WIDTH;
  const webp = IMG_RESIZABLE.test(path) && /image\/webp/.test(request.headers.get('Accept') || '');
  const variant = webp ? `w${width}.webp` : 'original';

  const cache = caches.default;
  const key = new Request(`https://puppyplace.ng/img/${path}?v=${variant}`);
  const hit = await cache.match(key);
  if (hit) return request.method === 'HEAD' ? new Response(null, { headers: hit.headers }) : hit;

  const original = `${env.SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${path}`;
  let up = null, resized = false;
  if (webp) {
    try {
      const r = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(original)}&w=${width}&we&q=80&output=webp`, { signal: AbortSignal.timeout(15000) });
      if (r.ok && /^image\//.test(r.headers.get('Content-Type') || '')) { up = r; resized = true; }
    } catch { /* fall back to the original */ }
  }
  if (!up) up = await fetch(original, { cf: { cacheEverything: true, cacheTtl: IMG_CACHE_SECONDS } });
  if (!up.ok) return new Response('Not found', { status: up.status === 404 || up.status === 400 ? 404 : 502, headers: { 'Cache-Control': 'public, max-age=60' } });
  const keep = webp && !resized ? 86400 : IMG_CACHE_SECONDS;
  const res = new Response(up.body, {
    headers: {
      'Content-Type': up.headers.get('Content-Type') || 'application/octet-stream',
      'Cache-Control': `public, max-age=${keep}`,
      'Vary': 'Accept',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      ...(up.headers.get('Content-Length') ? { 'Content-Length': up.headers.get('Content-Length') } : {}),
    },
  });
  ctx.waitUntil(cache.put(key, res.clone()));
  return request.method === 'HEAD' ? new Response(null, { headers: res.headers }) : res;
}

/* ── SMALLER STORED PHOTOS ──────────────────────────────────────────────
 * Photos are kept at most STORE_WIDTH wide: new ones are shrunk right after
 * they are saved, and Admin → Settings → "Shrink stored photos" does the ones
 * already there. The stored file keeps its name and link; it is only replaced
 * when the smaller copy saves at least a fifth of its size.
 */
const STORE_WIDTH = 1600;
const SHRINK_MIN_BYTES = 300 * 1024;
// The site logo doubles as the browser-tab icon, which should stay a real PNG.
const SITE_ICON = '851017C8-BF5F-41F8-96D2-8F191E7D2833.png';

// "seller-pets/x.jpg", or its public link → replaced in place by a 1600px copy.
// Returns { before, after } in bytes, or { skipped } with the reason.
async function shrinkStoredPhoto(env, fileOrUrl) {
  const file = String(fileOrUrl).replace(/^.*\/storage\/v1\/object\/public\/hero-images\//, '');
  if (!IMG_RESIZABLE.test(file)) return { skipped: 'not a JPEG, PNG or WebP' };
  if (file === SITE_ICON) return { skipped: 'the site icon' };
  const original = `${env.SUPABASE_URL}/storage/v1/object/public/${IMG_BUCKET}/${file}`;
  const head = await fetch(original, { method: 'HEAD' });
  const before = Number(head.headers.get('Content-Length')) || 0;
  if (!head.ok) return { skipped: `not found (${head.status})` };
  if (before && before < SHRINK_MIN_BYTES) return { skipped: 'already small', before };
  // JPEGs stay JPEG. PNGs become WebP: a photo saved as PNG is several times the
  // size it needs to be, re-saving it as PNG barely helps, and WebP keeps
  // see-through backgrounds. The file keeps its name and link; it is served with
  // its real type, which every current browser reads.
  const fmt = /\.jpe?g$/i.test(file) ? 'jpg' : 'webp';
  const r = await fetch(`https://wsrv.nl/?url=${encodeURIComponent(original)}&w=${STORE_WIDTH}&we&q=82&output=${fmt}`, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) return { skipped: `resize failed (${r.status})`, before };
  const bytes = new Uint8Array(await r.arrayBuffer());
  const known = before || bytes.byteLength * 2;
  if (!bytes.byteLength || bytes.byteLength > known * 0.8) return { skipped: 'not much smaller', before, after: bytes.byteLength };
  const key = env.SUPABASE_SERVICE_KEY;
  const put = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${IMG_BUCKET}/${file}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': fmt === 'jpg' ? 'image/jpeg' : 'image/webp', 'x-upsert': 'true' },
    body: bytes,
  });
  if (!put.ok) return { skipped: `save failed (${put.status})`, before };
  return { before, after: bytes.byteLength };
}

// Shrinking right after a save, without holding up the answer.
const shrinkLater = (ctx, env, files) => ctx.waitUntil(
  Promise.all(files.map((f) => shrinkStoredPhoto(env, f).catch((err) => console.error('shrink failed:', f, err?.message ?? err))))
);

// Every photo file in hero-images: [{ name, size }], folders followed.
async function listStoredPhotos(env) {
  const key = env.SUPABASE_SERVICE_KEY;
  const out = [];
  const folders = [''];
  for (let n = 0; folders.length && n < 40; n++) {
    const prefix = folders.shift();
    for (let offset = 0; ; offset += 1000) {
      const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${IMG_BUCKET}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      if (!r.ok) throw new Error(`could not list photos (${r.status})`);
      const items = await r.json();
      for (const it of items) {
        const name = prefix ? `${prefix}/${it.name}` : it.name;
        if (!it.id) folders.push(name); // a folder
        else if (it.name !== '.emptyFolderPlaceholder') out.push({ name, size: Number(it.metadata?.size) || 0 });
      }
      if (items.length < 1000) break;
    }
  }
  return out;
}

// POST /api/admin/shrink-photos { token, action: 'list' } → the photos worth shrinking
//                               { token, action: 'shrink', names: [...up to 8] } → results
async function handleAdminShrink(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);
  if (b.action === 'list') {
    const all = await listStoredPhotos(env);
    const big = all.filter((f) => f.size >= SHRINK_MIN_BYTES && IMG_RESIZABLE.test(f.name));
    return jsonResp({ ok: true, total: all.length, totalBytes: all.reduce((n, f) => n + f.size, 0), big }, 200);
  }
  if (b.action !== 'shrink') return jsonResp({ error: 'Unknown action' }, 400);
  const names = (Array.isArray(b.names) ? b.names : []).filter((n) => typeof n === 'string' && !n.includes('..')).slice(0, 8);
  const results = await Promise.all(names.map(async (name) => ({ name, ...(await shrinkStoredPhoto(env, name).catch((err) => ({ skipped: err?.message || 'failed' }))) })));
  return jsonResp({ ok: true, results }, 200);
}

/* ── OLD SOCIAL VIDEOS ──────────────────────────────────────────────────
 * n8n's "PuppyPlace Video Posting" saves each video to the puppy-videos bucket
 * only so Facebook, Instagram, WhatsApp and Gemini can fetch it, which they do
 * within minutes. Nothing on the site shows them, so every night videos older
 * than VIDEO_KEEP_DAYS are deleted (the video_posts rows stay as a record).
 */
const VIDEO_BUCKET = 'puppy-videos';
const VIDEO_KEEP_DAYS = 3;

async function deleteOldVideos(env, now = Date.now()) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('server not configured');
  const key = env.SUPABASE_SERVICE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  const cutoff = now - VIDEO_KEEP_DAYS * 864e5;
  const old = [];
  let kept = 0;
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${VIDEO_BUCKET}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prefix: '', limit: 1000, offset, sortBy: { column: 'created_at', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`could not list videos (${r.status})`);
    const items = await r.json();
    for (const it of items) {
      if (!it.id) continue; // a folder: videos are saved at the top
      const made = Date.parse(it.created_at || '');
      if (made && made < cutoff) old.push({ name: it.name, size: Number(it.metadata?.size) || 0 });
      else kept++;
    }
    if (items.length < 1000) break;
  }
  let deleted = 0, bytes = 0;
  for (let i = 0; i < old.length; i += 100) {
    const batch = old.slice(i, i + 100);
    const d = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: batch.map((v) => v.name) }),
    });
    if (!d.ok) throw new Error(`could not delete videos (${d.status})`);
    deleted += batch.length;
    bytes += batch.reduce((n, v) => n + v.size, 0);
  }
  return { deleted, bytes, kept };
}

/* ── ADMIN DATA ─────────────────────────────────────────────────────────
 * The admin's products, blog posts and store settings go through here with the
 * admin token, so the public key needs no write access to them
 * (supabase/lock_tables.sql). admin.html sends the same calls it used to make to
 * Supabase directly: { table, method, select, filters, order, limit, single, body, upsert }.
 */
const ADMIN_DATA_TABLES = new Set(['shop_products', 'blog_posts', 'store_settings']);

async function handleAdminData(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);
  const q = b.q || {};
  if (!ADMIN_DATA_TABLES.has(q.table)) return jsonResp({ error: 'Not allowed' }, 403);
  const method = ['GET', 'POST', 'PATCH', 'DELETE'].includes(q.method) ? q.method : null;
  if (!method) return jsonResp({ error: 'Not allowed' }, 400);

  const params = [];
  const col = (c) => (/^[a-z_][a-z0-9_]*$/i.test(String(c)) ? c : null);
  for (const [c, op, v] of Array.isArray(q.filters) ? q.filters : []) {
    if (!col(c) || !['eq', 'neq', 'in'].includes(op)) return jsonResp({ error: 'Bad filter' }, 400);
    const val = op === 'in'
      ? `(${(Array.isArray(v) ? v : []).map((x) => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')})`
      : String(v);
    params.push(`${c}=${op}.${encodeURIComponent(val)}`);
  }
  if ((method === 'PATCH' || method === 'DELETE') && !params.length) return jsonResp({ error: 'A filter is required' }, 400);
  const select = q.select == null ? null : String(q.select).replace(/\s+/g, '');
  if (select && !/^(\*|[a-z_][a-z0-9_]*)(,[a-z_][a-z0-9_]*)*$/i.test(select)) return jsonResp({ error: 'Bad select' }, 400);
  if (method === 'GET') params.push(`select=${select || '*'}`);
  for (const [c, dir] of Array.isArray(q.order) ? q.order : []) {
    if (!col(c)) return jsonResp({ error: 'Bad order' }, 400);
    params.push(`order=${c}.${dir === 'desc' ? 'desc' : 'asc'}`);
  }
  if (Number.isInteger(q.limit) && q.limit > 0) params.push(`limit=${Math.min(q.limit, 5000)}`);

  const prefer = method === 'GET' ? null : [q.upsert ? 'resolution=merge-duplicates' : null, 'return=representation'].filter(Boolean).join(',');
  const r = await sbJson(env, `${q.table}?${params.join('&')}`, {
    method,
    ...(prefer ? { headers: { Prefer: prefer } } : {}),
    ...(method === 'POST' || method === 'PATCH' ? { body: JSON.stringify(q.body ?? {}) } : {}),
  });
  if (!r.ok) return jsonResp({ error: (r.body && r.body.message) || `Database error (${r.status})` }, r.status >= 400 && r.status < 500 ? 400 : 502);
  let data = r.body;
  if (q.single) {
    data = Array.isArray(data) ? data[0] ?? null : data;
    if (data === null && q.single !== 'maybe') return jsonResp({ error: 'Not found' }, 404);
  }
  return jsonResp({ ok: true, data }, 200);
}

/* ── PETS FOR THE BROWSER AND THE ADMIN ──────────────────────────────────
 * The browser no longer reads the pets table from Supabase: the home page gets
 * live pets from /api/pets, without sellers' numbers (contact goes through the
 * pet page's sign in), and the admin reads and changes pets through
 * /api/admin/pets with its token. supabase/private_pets.sql then closes the
 * table to the public key.
 */

// GET /api/pets → live pets for the home page; "contact" says whether the seller can be reached
async function handlePublicPets(env) {
  if (!env.SUPABASE_URL) return jsonResp({ error: 'Server not configured' }, 503);
  const r = await sbJson(env, `pets?active=eq.true&order=created_at.desc&limit=500&select=${PET_LIST_FIELDS},created_at,whatsapp`);
  if (!r.ok) return jsonResp({ error: 'Could not load pets' }, 502);
  const pets = r.body.map(({ whatsapp, ...p }) => ({ ...p, contact: Boolean(String(whatsapp || '').replace(/\D/g, '')) }));
  return new Response(viaCdn(JSON.stringify({ pets })), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
}

const ADMIN_PET_FIELDS = ['breed', 'name', 'breeder', 'type', 'listing_type', 'pedigree', 'price', 'age', 'specs', 'location', 'whatsapp', 'image_urls', 'image_url', 'dewormed', 'vaccinated', 'active'];

// POST /api/admin/pets { token, action: 'list' | 'get' | 'save' | 'set_active' | 'delete', id, pet, active }
async function handleAdminPets(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);
  const id = b.id == null ? '' : encodeURIComponent(String(b.id));
  const fail = (r, what) => jsonResp({ error: `${what} (${r.status}): ${typeof r.body === 'object' ? r.body?.message || '' : r.body || ''}`.trim() }, 500);

  if (b.action === 'list') {
    const r = await sbJson(env, 'pets?select=*&order=created_at.desc&limit=2000');
    return r.ok ? jsonResp({ ok: true, pets: r.body }, 200) : fail(r, 'Could not load pets');
  }
  if (!['get', 'save', 'set_active', 'delete'].includes(b.action)) return jsonResp({ error: 'Unknown action' }, 400);
  if (b.action !== 'save' && !id) return jsonResp({ error: 'Which pet?' }, 400);

  if (b.action === 'get') {
    const r = await sbJson(env, `pets?id=eq.${id}&select=*&limit=1`);
    if (!r.ok) return fail(r, 'Could not load the pet');
    return r.body[0] ? jsonResp({ ok: true, pet: r.body[0] }, 200) : jsonResp({ error: 'Pet not found' }, 404);
  }
  if (b.action === 'set_active') {
    const r = await sbJson(env, `pets?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: b.active === true }) });
    return r.ok ? jsonResp({ ok: true }, 200) : fail(r, 'Could not change the pet');
  }
  if (b.action === 'delete') {
    const r = await sbJson(env, `pets?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return r.ok ? jsonResp({ ok: true }, 200) : fail(r, 'Could not delete the pet');
  }

  // save: only the fields the admin form edits
  const pet = {};
  for (const k of ADMIN_PET_FIELDS) if (b.pet && k in b.pet) pet[k] = b.pet[k];
  if (!cleanText(pet.breed, 80)) return jsonResp({ error: 'Breed is required' }, 400);
  if (pet.image_urls !== undefined && !Array.isArray(pet.image_urls)) return jsonResp({ error: 'Photos must be a list' }, 400);
  const r = id
    ? await sbJson(env, `pets?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(pet) })
    : await sbJson(env, 'pets', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...pet, slug: cleanText(b.pet?.slug, 160) || null }) });
  return r.ok ? jsonResp({ ok: true }, 200) : fail(r, 'Could not save the pet');
}

/* ── BREED GUIDES ── */

// What a breed is filed under: "Cane Corso", "cane corso " and "Cane-corso" are one.
// Nothing for "mixed", "local" and the like, which are not a breed to write about.
const NOT_A_BREED = new Set(['mixed', 'mix', 'mixed breed', 'cross', 'crossbreed', 'cross breed', 'local', 'unknown', 'not sure', 'idk', 'none', 'nil', 'other', 'mongrel', 'ordinary', 'dog', 'puppy', 'puppies', 'cat', 'kitten', 'pet']);
function breedKey(text) {
  const k = String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return k.length >= 3 && k.length <= 60 && !NOT_A_BREED.has(k) ? k : '';
}

// Plain text only: no tags, no control characters, and a length that fits a card.
function cleanGuide(text) {
  const t = String(text ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/<[^>]*>/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return t.length >= 20 && t.length <= 1500 ? t : null;
}

// POST /api/breed-guides  (same shared key)  { breed, summary, pet_type }
// Files a guide as a draft. A breed that already has one is left alone, so
// nothing the store has approved or edited is ever overwritten.
async function handleBreedGuideSubmit(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SELLER_API_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(auth, String(env.SELLER_API_KEY).trim())) return jsonResp({ error: 'Unauthorized' }, 401);

  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Body must be JSON' }, 400); }
  const key = breedKey(b?.breed);
  const summary = cleanGuide(b?.summary);
  if (!key || !summary) return jsonResp({ error: 'A breed and a summary of 20 to 1500 characters are required' }, 400);

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/breed_guides?on_conflict=breed_key`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ breed_key: key, breed_name: String(b.breed).trim().slice(0, 60), pet_type: typeof b.pet_type === 'string' ? b.pet_type.slice(0, 20) : null, summary, status: 'draft' }),
  });
  if (!res.ok) {
    console.error('breed guide insert failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return jsonResp({ error: 'Breed guides are not set up on the site' }, 503);
  }
  const rows = await res.json();
  return jsonResp({ ok: true, status: 'draft', created: Array.isArray(rows) && rows.length > 0 }, 201);
}

// POST /api/breed-guides/admin  { token, action: 'list' | 'approve' | 'reject' | 'save', key, summary }
async function handleBreedGuideAdmin(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return jsonResp({ error: 'Server not configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return jsonResp({ error: 'Invalid request' }, 400); }
  if (!(await verifyToken(b?.token, env))) return jsonResp({ error: 'Unauthorized' }, 401);

  const h = sbHeaders(env);
  const base = `${env.SUPABASE_URL}/rest/v1/breed_guides`;

  if (b.action === 'list') {
    const res = await fetch(`${base}?select=breed_key,breed_name,pet_type,summary,status,created_at,approved_at&order=created_at.desc&limit=200`, { headers: h });
    if (!res.ok) return jsonResp({ error: 'Breed guides are not set up on the site yet' }, 503);
    return jsonResp({ ok: true, guides: await res.json() }, 200);
  }

  const key = breedKey(b.key);
  if (!key || b.key !== key) return jsonResp({ error: 'A valid breed is required' }, 400);
  let patch;
  if (b.action === 'approve' || b.action === 'save') {
    const summary = b.summary === undefined ? undefined : cleanGuide(b.summary);
    if (b.summary !== undefined && !summary) return jsonResp({ error: 'The guide must be 20 to 1500 characters of plain text' }, 400);
    patch = { ...(summary ? { summary } : {}), ...(b.action === 'approve' ? { status: 'approved', approved_at: new Date().toISOString() } : {}) };
    if (!Object.keys(patch).length) return jsonResp({ error: 'Nothing to save' }, 400);
  } else if (b.action === 'reject') {
    patch = { status: 'rejected', approved_at: null };
  } else {
    return jsonResp({ error: 'Unknown action' }, 400);
  }

  const res = await fetch(`${base}?breed_key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  if (!res.ok) return jsonResp({ error: 'Could not save the guide' }, 500);
  if (!(await res.json()).length) return jsonResp({ error: 'Guide not found' }, 404);
  return jsonResp({ ok: true }, 200);
}

// GET /api/seller-listings/status?slugs=a,b,c  (same shared key)
//
// → { live: [...], pending: [...], missing: [...] }. Live is approved and
// showing; pending is waiting for the store; missing is not there any more
// (deleted). Vendwyze asks once a minute about the listings it sent and tells
// each seller whose is live, however the store approved it.
async function handleSellerListingStatus(request, url, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.SELLER_API_KEY) {
    return jsonResp({ error: 'Server not configured' }, 503);
  }
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!safeEqual(auth, String(env.SELLER_API_KEY).trim())) return jsonResp({ error: 'Unauthorized' }, 401);

  // Slugs are letters, digits and hyphens: anything else cannot be one of ours,
  // and is never put into a query.
  const slugs = [...new Set((url.searchParams.get('slugs') || '').split(',').map((x) => x.trim()).filter(Boolean))];
  if (!slugs.length || slugs.length > 50 || slugs.some((x) => !/^[a-z0-9][a-z0-9-]{0,119}$/.test(x))) {
    return jsonResp({ error: 'slugs must be 1 to 50 slugs, separated by commas' }, 400);
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/pets?slug=in.(${slugs.join(',')})&select=slug,active`, { headers: sbHeaders(env) });
  if (!res.ok) {
    console.error('seller listing status failed:', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return jsonResp({ error: 'Could not read the listings' }, 500);
  }
  const rows = await res.json();
  const found = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.slug, r.active === true]));
  return jsonResp({
    live: slugs.filter((x) => found.get(x) === true),
    pending: slugs.filter((x) => found.get(x) === false),
    missing: slugs.filter((x) => !found.has(x)),
  }, 200);
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

async function handleOgImageProxy(request, url, env, ctx) {
  const imgUrl = url.searchParams.get('url');
  const supabaseHost = env.SUPABASE_URL ? new URL(env.SUPABASE_URL).host : null;
  if (!imgUrl || !supabaseHost || !imgUrl.startsWith(`https://${supabaseHost}/storage/`)) {
    return new Response('Forbidden', { status: 403 });
  }
  // WhatsApp and Facebook fetch these often: answer from Cloudflare's cache.
  const cacheKey = new Request(`https://puppyplace.ng/api/og-img?url=${encodeURIComponent(imgUrl)}`);
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

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

  const res = new Response(imageData, {
    headers: {
      'Content-Type':                ct,
      'Content-Length':              String(imageData.byteLength),
      'Cache-Control':               'public, max-age=604800, immutable',
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options':      'nosniff',
      // Preview copies of images for WhatsApp/Facebook; keep them out of Google
      'X-Robots-Tag':                'noindex',
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
}

/* ── PETS LISTING PAGES ── */
// /pets.html, one page per pet type (/dogs-for-sale.html), per type and city
// (/dogs-for-sale-in-lagos.html, /pets-for-sale-in-lagos.html) and
// /pets-for-adoption.html. The listings are drawn into the page here so
// search engines see them, and the page script filters them in the browser.

const PET_KINDS = [
  { key: 'dogs',       type: 'Dog',    label: 'Dogs',    title: 'Dogs & Puppies', one: 'dog',    many: 'dogs',    young: 'puppies', emoji: '🐕' },
  { key: 'cats',       type: 'Cat',    label: 'Cats',    title: 'Cats & Kittens', one: 'cat',    many: 'cats',    young: 'kittens', emoji: '🐱' },
  { key: 'birds',      type: 'Bird',   label: 'Birds',   title: 'Birds',          one: 'bird',   many: 'birds',   emoji: '🦜' },
  { key: 'rabbits',    type: 'Rabbit', label: 'Rabbits', title: 'Rabbits',        one: 'rabbit', many: 'rabbits', emoji: '🐰' },
  { key: 'fish',       type: 'Fish',   label: 'Fish',    title: 'Fish',           one: 'fish',   many: 'fish',    emoji: '🐠' },
  { key: 'other-pets', type: 'other',  label: 'Others',  title: 'Other Pets',     one: 'pet',    many: 'pets like guinea pigs and reptiles' },
];
const ALL_PETS_KIND = { key: 'pets', type: null, label: 'All', title: 'Pets', one: 'pet', many: 'pets', emoji: '🐾' };

// A listing's location is free text ("Opic estate, Lagos"); the first city whose
// words appear in it is where the listing is filed
const PET_CITIES = [
  ['lagos', 'Lagos', 'lagos|lekki|ikeja|ajah|yaba|surulere|ikorodu|ikoyi|victoria island|festac|gbagada|magodo|ogba|agege|alimosho|isolo|oshodi|egbeda|ipaja|sangotedo|ojodu|ketu|ilupeju|ojo|badagry|epe'],
  ['abuja', 'Abuja', 'abuja|fct|gwarinpa|wuse|maitama|garki|lugbe|kubwa|asokoro|jabi|lokogoma|katampe|life camp'],
  ['port-harcourt', 'Port Harcourt', 'port ?harcourt|ph|rivers'],
  ['ibadan', 'Ibadan', 'ibadan|oyo'],
  ['ogun', 'Ogun', 'ogun|abeokuta|ota|sango|mowe|ibafo|ijebu|sagamu|shagamu|arepo'],
  ['benin-city', 'Benin City', 'benin|edo'],
  ['enugu', 'Enugu', 'enugu|nsukka'],
  ['owerri', 'Owerri', 'owerri|imo'],
  ['uyo', 'Uyo', 'uyo|akwa ibom'],
  ['calabar', 'Calabar', 'calabar|cross river'],
  ['warri', 'Warri', 'warri|effurun'],
  ['asaba', 'Asaba', 'asaba|delta'],
  ['anambra', 'Anambra', 'anambra|onitsha|awka|nnewi'],
  ['abia', 'Abia', 'abia|aba|umuahia'],
  ['kano', 'Kano', 'kano'],
  ['kaduna', 'Kaduna', 'kaduna|zaria'],
  ['jos', 'Jos', 'jos|plateau'],
  ['ilorin', 'Ilorin', 'ilorin|kwara'],
  ['osun', 'Osun', 'osun|osogbo|ile-?ife|ilesa'],
  ['akure', 'Akure', 'akure|ondo'],
  ['ekiti', 'Ekiti', 'ekiti'],
].map(([slug, name, words]) => ({ slug, name, words: `\\b(?:${words})\\b`, re: new RegExp(`\\b(?:${words})\\b`, 'i') }));

const PET_LIST_FIELDS = 'id,slug,breed,name,breeder,type,listing_type,pedigree,price,age,specs,location,image_url,image_urls,dewormed,vaccinated';
const PETS_PER_LIST_JSONLD = 60;
// A city page needs this many listings before search engines are asked to index it
const CITY_PAGE_MIN = 2;

function petKindOf(p) { return MAIN_TYPES.includes(p.type) ? p.type : 'other'; }
function petCityOf(p) { return PET_CITIES.find(c => c.re.test(p.location || '')) || null; }
function petsPagePath(kind, city, adoption) {
  if (adoption) return '/pets-for-adoption.html';
  if (!kind.type && !city) return '/pets.html';
  return `/${kind.key}-for-sale${city ? `-in-${city.slug}` : ''}.html`;
}

// Which listings page an address asks for: { kind, city, adoption }, a redirect, or null
function matchPetsPage(pathname) {
  if (pathname === '/pets.html') return { kind: ALL_PETS_KIND, city: null, adoption: false };
  if (pathname === '/pets' || pathname === '/pets/' || pathname === '/pets-for-sale' || pathname === '/pets-for-sale.html') return { redirect: '/pets.html' };
  if (pathname === '/pets-for-adoption.html') return { kind: ALL_PETS_KIND, city: null, adoption: true };
  if (pathname === '/pets-for-adoption') return { redirect: '/pets-for-adoption.html' };
  const m = pathname.match(/^\/(dogs|cats|birds|rabbits|fish|other-pets|pets)-for-sale(?:-in-([a-z-]+))?(\.html)?$/);
  if (!m) return null;
  const kind = m[1] === 'pets' ? ALL_PETS_KIND : PET_KINDS.find(k => k.key === m[1]);
  const city = m[2] ? PET_CITIES.find(c => c.slug === m[2]) : null;
  if (m[2] && !city) return { notFound: true };
  if (!m[3]) return { redirect: petsPagePath(kind, city, false) };
  return { kind, city, adoption: false };
}

async function getLivePets(env) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/pets?active=eq.true&order=created_at.desc&select=${PET_LIST_FIELDS}`, { headers: sbHeaders(env) });
  if (!res.ok) throw new Error(`pets ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function petsInPage(pets, kind, city, adoption) {
  return pets.filter(p => (!kind.type || petKindOf(p) === kind.type)
    && (!city || city.re.test(p.location || ''))
    && (!adoption || p.listing_type === 'adoption'));
}

function petPriceStats(pets) {
  const prices = pets.filter(p => p.listing_type !== 'adoption' && p.price > 0).map(p => Number(p.price)).sort((a, b) => a - b);
  if (!prices.length) return null;
  return { min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)] };
}

function topBreeds(pets, n = 4) {
  const counts = new Map();
  for (const p of pets) {
    const b = String(p.breed || '').trim();
    if (!b || b.length > 40) continue;
    const k = b.toLowerCase();
    const cur = counts.get(k) || { name: b, n: 0 };
    cur.n++;
    counts.set(k, cur);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, n).map(x => x.name);
}

function listJoin(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const naira = n => '₦' + Number(n).toLocaleString('en-NG');

async function servePetsPage(page, env) {
  const { kind, city, adoption } = page;
  let pets, failed = false;
  try {
    pets = env.SUPABASE_URL ? await getLivePets(env) : [];
  } catch (e) {
    console.error('pets page:', e.message);
    pets = [];
    failed = true;
  }

  const shown = petsInPage(pets, kind, city, adoption);
  const place = city ? city.name : 'Nigeria';
  const inPlace = `in ${place}`;
  const path = petsPagePath(kind, city, adoption);
  const canonical = `https://puppyplace.ng${path}`;
  const stats = petPriceStats(shown);
  const breeds = topBreeds(shown);
  const isMain = !kind.type && !city && !adoption;
  const count = shown.length;
  const many = kind.type === 'other' ? 'pets' : kind.many;
  const aOne = kind.one === 'fish' ? 'fish' : `a ${kind.one}`;

  // ── Words for this page ──
  let title, h1, sub, description;
  if (adoption) {
    title = 'Pets for Adoption in Nigeria – Adopt a Dog or Cat | PuppyPlace.ng';
    h1 = 'Pets for Adoption<br/>in <span>Nigeria</span>';
    sub = 'Give a dog, cat or other pet a new home. Owners across Nigeria rehome their pets here, many for free.';
  } else if (isMain) {
    title = 'Pets for Sale in Nigeria – Buy & Sell Dogs, Cats & More | PuppyPlace.ng';
    h1 = 'Find Your Perfect Pet<br/>in <span>Nigeria</span>';
    sub = 'Buy, sell or adopt healthy dogs, cats, birds, rabbits and more from trusted breeders across Nigeria.';
  } else {
    const lead = `${kind.title} for Sale in ${place}`;
    title = city
      ? `${lead}${count >= CITY_PAGE_MIN ? ` – ${count} Listings` : ''} | PuppyPlace.ng`
      : kind.type === 'other'
        ? `${lead} – Guinea Pigs, Reptiles & More | PuppyPlace.ng`
        : `${lead} – Buy or Sell ${kind.one === 'fish' ? 'Fish' : `a ${kind.one[0].toUpperCase()}${kind.one.slice(1)}`} | PuppyPlace.ng`;
    h1 = `${esc(kind.title)} for Sale<br/>in <span>${esc(place)}</span>`;
    sub = kind.type === 'other'
      ? `Buy guinea pigs, reptiles and other pets from trusted owners ${inPlace}. Chat with sellers directly on WhatsApp.`
      : kind.type
        ? `Buy healthy ${kind.many}${kind.young ? ` and ${kind.young}` : ''} from trusted breeders and owners ${inPlace}. Chat with sellers directly on WhatsApp.`
        : `Buy, sell or adopt healthy dogs, cats, birds, rabbits and more from trusted sellers ${inPlace}.`;
  }
  const countWords = count === 1 ? `1 ${kind.type === 'other' ? 'pet' : kind.one}` : `${count} ${many}`;
  const adoptN = shown.filter(p => p.listing_type === 'adoption').length;
  const forWhat = adoption || (count && adoptN === count) ? 'for adoption' : adoptN ? 'for sale and adoption' : 'for sale';
  description = [
    count ? `Browse ${countWords} ${forWhat} ${inPlace}${stats ? ` from ${naira(stats.min)}` : ''}.` : `${kind.title} ${adoption ? 'for adoption' : 'for sale'} ${inPlace} on PuppyPlace.ng.`,
    breeds.length ? `${breeds.slice(0, 3).join(', ')} and more.` : '',
    'Chat with sellers on WhatsApp, or list your pet free.',
  ].filter(Boolean).join(' ');

  const indexable = !failed && (isMain || (city ? count >= CITY_PAGE_MIN : count >= 1));

  // ── Pills: real links, so every type page is one click from every other ──
  const otherIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="3.5"/><circle cx="17" cy="7" r="3.5"/><circle cx="7" cy="17" r="3.5"/><circle cx="17" cy="17" r="3.5"/></svg>';
  const pillCity = city && pets.length ? city : null;
  const pills = [ALL_PETS_KIND, ...PET_KINDS].map(k => {
    const on = !adoption && k.key === kind.key;
    const href = petsPagePath(k, pillCity, false);
    const icon = k.emoji ? `<span class="em">${k.emoji}</span>` : otherIcon;
    return `      <a class="pill${on ? ' on' : ''}" data-type="${k.type || 'all'}" href="${href}"${on ? ' aria-current="page"' : ''}>${icon}${k.label}</a>`;
  }).join('\n');

  // ── Listings ──
  const emptyHtml = `<div class="pet-grid-empty"><div class="ico">${kind.emoji || '🐾'}</div><div>${failed ? 'We couldn’t load the pets just now. Please refresh the page.' : `No ${esc(many)} ${adoption ? 'for adoption' : 'listed'} ${esc(inPlace)} yet. Check back soon!`}</div>${!failed && !isMain ? `<a class="sell-pill" href="/pets.html">See all pets in Nigeria →</a>` : ''}</div>`;
  const grid = count ? shown.map((p, i) => renderPetCard(p, false, i < 4)).join('\n') : emptyHtml;
  const gridTitle = count ? `${countWords} ${forWhat} ${inPlace}` : `${kind.title} ${inPlace}`;

  // ── Text for buyers and sellers ──
  const kindLinks = PET_KINDS.map(k => {
    const n = petsInPage(pets, k, city, false).length;
    if (city && n < CITY_PAGE_MIN) return '';
    if (!n) return '';
    return `<a href="${petsPagePath(k, city, false)}">${k.emoji || '🐾'} ${esc(k.title)} ${esc(inPlace)} <span>${n}</span></a>`;
  }).filter(Boolean);
  if (city) kindLinks.push(`<a href="${petsPagePath(kind, null, false)}">${kind.emoji || '🐾'} ${esc(kind.title)} in Nigeria</a>`);
  const cityLinks = adoption ? [] : PET_CITIES.map(c => {
    const n = petsInPage(pets, kind, c, false).length;
    return n >= CITY_PAGE_MIN && (!city || c.slug !== city.slug) ? `<a href="${petsPagePath(kind, c, false)}">📍 ${esc(kind.title)} in ${esc(c.name)} <span>${n}</span></a>` : '';
  }).filter(Boolean);
  const adoptCount = pets.filter(p => p.listing_type === 'adoption').length;

  const one = kind.type === 'other' ? 'pet' : kind.one;
  const sellHref = kind.type === 'Dog' || !kind.type
    ? '/sell-my-dog.html'
    : `https://wa.me/2348156740438?text=${encodeURIComponent(`Hi PuppyPlace, I want to sell my ${one}.`)}`;
  const sellExternal = sellHref.startsWith('http') ? ' target="_blank" rel="noopener"' : '';

  const buyIntro = count
    ? `There ${count === 1 ? 'is' : 'are'} ${countWords} ${adoption ? 'up for adoption' : 'listed'} ${inPlace} right now${stats && !adoption ? `, priced from ${naira(stats.min)} to ${naira(stats.max)}` : ''}.${breeds.length ? ` Popular breeds include ${esc(listJoin(breeds))}.` : ''}`
    : `There are no ${esc(many)} listed ${esc(inPlace)} right now. New listings go up every week, so check back soon.`;

  const faqs = [
    [`How do I buy ${aOne === 'fish' ? 'fish' : `a ${one}`} in ${place}?`,
      `Browse the ${many} listed on PuppyPlace, open one to see its photos, age, health details and price, then tap Contact on WhatsApp to talk to the seller. Arrange to meet, see the ${one} in person and check its health or vaccination records before you pay anything.`],
    [`How much does ${aOne === 'fish' ? 'fish' : `a ${one}`} cost in ${place}?`,
      stats && !adoption
        ? `On PuppyPlace right now, ${many} for sale ${inPlace} cost from ${naira(stats.min)} to ${naira(stats.max)}, and the middle price is about ${naira(stats.median)}. The price depends on the breed, age, pedigree, vaccinations and the quality of the parents.`
        : `The price depends on the breed, age, pedigree, vaccinations and the quality of the parents. Open the listings on PuppyPlace to compare current prices ${inPlace}.`],
    [`How do I sell my ${one} in ${place}?`,
      `List it free on PuppyPlace. Send the breed, age, price, location and a few clear photos to our listing assistant on WhatsApp. We check the details and publish your listing, and buyers contact you directly on WhatsApp.`],
    [`Is it free to list ${aOne === 'fish' ? 'fish' : `a ${one}`} on PuppyPlace?`,
      `Yes. Listing a pet for sale or adoption on PuppyPlace is free.`],
    ['How do I avoid pet scams?',
      'Never pay any money, not even a deposit, before you have seen the pet in person. Meet the seller in a safe, public place, ask for health and vaccination records, and walk away if anything feels off.'],
    [`Can I adopt ${aOne === 'fish' ? 'fish' : `a ${one}`} for free?`,
      `Yes. Some owners rehome their pets for free. Look for the green Adoption label on a listing, or browse all pets for adoption on PuppyPlace.`],
  ];

  const seo = `  <section class="seo" aria-label="Buying and selling ${esc(many)} ${esc(inPlace)}">
    <div class="seo-card">
      <h2>${adoption ? 'Adopt a pet in Nigeria' : `Buy ${esc(aOne)} ${esc(inPlace)}`}</h2>
      <p>${buyIntro}</p>
      <p>Every listing is checked by PuppyPlace before it goes live. Open a listing to see its photos, age and health details, then chat with the seller directly on WhatsApp. Always see the pet and its health records first, and never pay any money, not even a deposit, before you have seen it.</p>
      <h2>Sell your ${esc(one)} on PuppyPlace</h2>
      <p>Listing is free. Send the breed, age, price, location and a few clear photos on WhatsApp, and we publish your listing after a quick check. Buyers across Nigeria contact you directly, with no middleman.</p>
      <div class="seo-ctas">
        <a class="seo-btn" href="${esc(sellHref)}"${sellExternal}>List your ${esc(one)} free</a>
        ${adoptCount && !adoption ? '<a class="seo-btn ghost" href="/pets-for-adoption.html">Pets for adoption</a>' : ''}
      </div>
    </div>
    <div class="seo-card">
      ${kindLinks.length ? `<h2>Browse by pet</h2><div class="seo-links">${kindLinks.join('')}</div>` : ''}
      ${cityLinks.length ? `<h2>${esc(kind.title)} by city</h2><div class="seo-links">${cityLinks.join('')}</div>` : ''}
      ${!kindLinks.length && !cityLinks.length ? `<h2>Browse pets</h2><div class="seo-links"><a href="/pets.html">🐾 All pets in Nigeria</a><a href="/dogs-for-sale.html">🐕 Dogs &amp; Puppies</a><a href="/cats-for-sale.html">🐱 Cats &amp; Kittens</a></div>` : ''}
    </div>
    <div class="seo-card faq">
      <h2>Questions about ${adoption ? 'adopting' : 'buying and selling'} ${esc(many)} ${esc(inPlace)}</h2>
      ${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n      ')}
    </div>
  </section>`;

  // ── Structured data ──
  const crumbs = [{ name: 'Home', url: 'https://puppyplace.ng/' }, { name: 'Pets', url: 'https://puppyplace.ng/pets.html' }];
  if (adoption) crumbs.push({ name: 'Pets for adoption', url: canonical });
  else if (kind.type) {
    crumbs.push({ name: `${kind.title} for sale`, url: `https://puppyplace.ng${petsPagePath(kind, null, false)}` });
    if (city) crumbs.push({ name: city.name, url: canonical });
  } else if (city) crumbs.push({ name: `Pets for sale in ${city.name}`, url: canonical });
  const plainTitle = title.replace(/ \| PuppyPlace\.ng$/, '');
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#page`,
        url: canonical,
        name: plainTitle,
        description,
        inLanguage: 'en-NG',
        isPartOf: { '@id': 'https://puppyplace.ng/#website' },
        about: { '@type': 'Thing', name: `${kind.title} ${adoption ? 'for adoption' : 'for sale'} ${inPlace}` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: count,
          itemListElement: shown.filter(p => p.slug).slice(0, PETS_PER_LIST_JSONLD).map((p, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `https://puppyplace.ng/pets/${encodeURIComponent(p.slug)}`,
            name: `${p.breed || p.type} ${p.listing_type === 'adoption' ? 'for adoption' : 'for sale'}${p.location ? ` in ${p.location}` : ''}`,
          })),
        },
      },
      { '@type': 'BreadcrumbList', itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })) },
      { '@type': 'FAQPage', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ],
  };

  const preset = {
    types: kind.type ? [kind.type] : [],
    cityRe: city ? city.words : '',
    adoption,
    emptyHtml,
  };
  // JSON inside <script> must not be able to close the tag
  const scriptJson = v => JSON.stringify(v).replace(/</g, '\\u003c');

  const fill = {
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    ROBOTS: indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow',
    CANONICAL: canonical,
    JSONLD: scriptJson(jsonLd),
    H1: h1,
    SUB: esc(sub),
    PILLS: pills,
    GRID_TITLE: esc(gridTitle),
    GRID: grid,
    SEO: seo,
    PETS_JSON: scriptJson(pets),
    PRESET_JSON: scriptJson(preset),
  };
  const out = PETS_TEMPLATE.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  return failed ? tryLater(out) : html(out, 200);
}

// Listing pages worth a place in the sitemap: each type page with listings,
// each type-and-city page with enough of them, and the adoption page
function petsSitemapPaths(pets) {
  const paths = [];
  for (const k of PET_KINDS) if (petsInPage(pets, k, null, false).length) paths.push(petsPagePath(k, null, false));
  if (pets.some(p => p.listing_type === 'adoption')) paths.push('/pets-for-adoption.html');
  for (const c of PET_CITIES) {
    for (const k of [ALL_PETS_KIND, ...PET_KINDS]) {
      if (petsInPage(pets, k, c, false).length >= CITY_PAGE_MIN) paths.push(petsPagePath(k, c, false));
    }
  }
  return paths;
}

async function servePetPage(slug, env) {
  if (!env.SUPABASE_URL) return html(petErrorPage('Server not configured.'), 503);
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/pets?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=*`,
      { headers: sbHeaders(env) }
    );
    // A database error is not "no such pet": a 404 here tells Google a live listing is gone
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    const rows = await res.json();
    if (!rows.length) return html(petNotFoundPage(), 404);
    return html(renderPetPage(rows[0], await approvedGuide(rows[0].breed, env)), 200);
  } catch (e) {
    console.error('pet ' + slug + ':', e.message);
    return tryLater(petErrorPage('Failed to load pet.'));
  }
}

// The approved guide for a breed, or null: no guide, not approved yet, or the
// table not there. The pet page never fails because of it.
async function approvedGuide(breed, env) {
  const key = breedKey(breed);
  if (!key) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/breed_guides?breed_key=eq.${encodeURIComponent(key)}&status=eq.approved&select=summary&limit=1`, { headers: sbHeaders(env) });
    if (!res.ok) return null;
    return (await res.json())[0]?.summary ?? null;
  } catch {
    return null;
  }
}

// "About: … / Temperament: … / Best home: …" as three short paragraphs, in its own card on the pet page.
function renderGuide(breed, summary) {
  const body = String(summary).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(About|Temperament|Best home):\s*(.+)$/.exec(l);
    return m ? `<p><strong>${m[1]}:</strong> ${esc(m[2])}</p>` : `<p>${esc(l)}</p>`;
  }).join('');
  const book = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ed6436" stroke-width="2" stroke-linejoin="round"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5v-13ZM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13Z"/></svg>';
  return `<section class="card section pg-guide"><div class="sec-head">${book}<div><h2>About the ${esc(breed)}</h2><p>A general guide to the breed, not a promise about this particular pet.</p></div></div><div class="guide-body">${body}</div></section>`;
}

function petNotFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Pet Not Found | PuppyPlace</title><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap" rel="stylesheet"/><style>body{font-family:'Nunito',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fa;text-align:center;padding:24px}h1{font-size:28px;font-weight:900;margin-bottom:12px}a{color:#ed6436;font-weight:800}</style></head><body><div><div style="font-size:72px;margin-bottom:20px">🐾</div><h1>Pet Not Found</h1><p style="color:#868686;margin-bottom:24px">This listing doesn't exist or may have been removed.</p><a href="/pets.html">← Browse All Pets</a></div></body></html>`;
}

function petErrorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><title>Error | PuppyPlace</title><link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;900&display=swap" rel="stylesheet"/><style>body{font-family:'Nunito',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8f9fa;text-align:center;padding:24px}a{color:#ed6436;font-weight:800}</style></head><body><div><h1>⚠️ ${esc(msg)}</h1><p style="color:#868686;margin-bottom:24px">Please try again later.</p><a href="/pets.html">← All Pets</a></div></body></html>`;
}

// Social profiles shown in the pet page footer
const PET_FOOTER_SOCIALS = [
  { name: 'Facebook',  url: 'https://www.facebook.com/puppyplace_ng', icon: '<path d="M14 8h3V4h-3c-2.8 0-4.5 1.8-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V9c0-.6.4-1 1-1Z" fill="currentColor"/>' },
  { name: 'Instagram', url: 'https://www.instagram.com/puppyplace_ng', icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/>' },
  { name: 'TikTok',    url: 'https://www.tiktok.com/@puppyplace.ng', icon: '<path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2.1-2.8V9.1a6.4 6.4 0 1 0 5.5 6.3V8.6a8 8 0 0 0 4.4 1.3V6.5a4.5 4.5 0 0 1-4.4-4.5Z" fill="currentColor"/>' },
];

// The pets table has no gender, colour or litter-size columns; sellers put
// them in the description ("Both sex, black, good, available, 3 pups")
function petGender(p) {
  const g = String(p.gender || p.sex || '').toLowerCase();
  if (g) return g.startsWith('f') ? 'Female' : g.startsWith('m') ? 'Male' : 'Both';
  const t = `${p.name || ''} ${p.specs || ''}`.toLowerCase();
  if (/\b(both sex(es)?|both sexes|male (and|&) female|males? (and|&) females?|pair)\b/.test(t)) return 'Both';
  if (/\bfemales?\b/.test(t)) return 'Female';
  if (/\bmales?\b/.test(t)) return 'Male';
  return '';
}
const PET_COLOURS = ['black', 'white', 'brown', 'tan', 'cream', 'fawn', 'brindle', 'grey', 'gray', 'golden', 'gold', 'red', 'blue', 'chocolate', 'merle', 'sable', 'apricot', 'silver', 'ginger', 'orange', 'tricolou?r', 'liver', 'champagne', 'green', 'yellow', 'albino'];
function petColour(p) {
  if (p.colour || p.color) return String(p.colour || p.color);
  const t = String(p.specs || '').toLowerCase();
  const found = [];
  for (const m of t.matchAll(new RegExp(`\\b(${PET_COLOURS.join('|')})\\b`, 'g'))) {
    const c = m[1] === 'gray' ? 'grey' : m[1];
    if (!found.includes(c)) found.push(c);
  }
  return found.slice(0, 3).map(c => c[0].toUpperCase() + c.slice(1)).join(' & ');
}
function petLitter(p) {
  const m = String(p.specs || '').toLowerCase().match(/\b(\d{1,2})\s*(pups?|puppies|kittens?|kits|chicks|babies)\b/);
  return m ? { n: m[1], word: /kit/.test(m[2]) ? 'Kittens' : /chick/.test(m[2]) ? 'Chicks' : 'Puppies' } : null;
}

function renderPetPage(p, guide = null) {
  const typeEmoji = {Dog:'🐕',Cat:'🐈',Bird:'🦜',Rabbit:'🐰',Fish:'🐠','Guinea Pig':'🐹',Reptile:'🦎'};
  const typeBg   = {Dog:'linear-gradient(135deg,#fdeee7,#fbd4c3)',Cat:'linear-gradient(135deg,#e8f5e9,#c8e6c9)',Bird:'linear-gradient(135deg,#e3f2fd,#bbdefb)',Rabbit:'linear-gradient(135deg,#f3e5f5,#e1bee7)',Fish:'linear-gradient(135deg,#e0f7fa,#b2ebf2)','Guinea Pig':'linear-gradient(135deg,#fff9c4,#fff59d)',Reptile:'linear-gradient(135deg,#f1f8e9,#dcedc8)'};
  const emoji = typeEmoji[p.type] || '🐾';
  const bg    = typeBg[p.type]   || 'linear-gradient(135deg,#fafafa,#f0f0f0)';
  const isAdopt = p.listing_type === 'adoption';
  const imgs = (p.image_urls && p.image_urls.length) ? p.image_urls : (p.image_url ? [p.image_url] : []);
  const wa = (p.whatsapp || '').replace(/\D/g, '');
  // Search titles read the way people search: "Cane Corso Puppies for Sale in Lagos – ₦550,000"
  const petKind  = PET_KINDS.find(k => k.type === petKindOf(p)) || ALL_PETS_KIND;
  const petCity  = petCityOf(p);
  const litterN  = Number((String(p.specs || '').match(/\b(\d{1,2})\s*(?:pups?|puppies|kittens?)\b/i) || [])[1] || 0);
  const weeks    = ageWeeks(p.age);
  const youngTitle = weeks !== null && weeks < 52
    ? ({ Dog: litterN > 1 ? 'Puppies' : 'Puppy', Cat: litterN > 1 ? 'Kittens' : 'Kitten' }[p.type] || '')
    : '';
  const placeName = petCity ? petCity.name : String(p.location || '').split(',').pop().trim().slice(0, 40);
  const titleLead = [p.breed || p.type, youngTitle, isAdopt ? 'for Adoption' : 'for Sale', placeName ? 'in ' + placeName : ''].filter(Boolean).join(' ');
  const pageTitle = `${titleLead}${!isAdopt && p.price ? ' – ' + naira(p.price) : ''} | PuppyPlace.ng`;
  const healthWords = [p.vaccinated && 'vaccinated', p.dewormed && 'dewormed'].filter(Boolean).join(' and ');
  const metaDesc = plainText([
    `${titleLead}${!isAdopt && p.price ? ' for ' + naira(p.price) : ''}${p.location && p.location !== placeName ? ` (${p.location})` : ''}.`,
    [p.age, healthWords].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + (p.age || healthWords ? '.' : ''),
    p.specs ? String(p.specs).replace(/\s+/g, ' ').trim().replace(/([^.!?])$/, '$1.') : '',
    'Chat with the seller on WhatsApp on PuppyPlace.ng.',
  ].filter(Boolean).join(' '), 160);
  const petUrl   = `https://puppyplace.ng/pets/${escUrl(p.slug)}`;
  const mainImg  = imgs[0] ? escUrl(imgs[0]) : '';
  const ogImg    = mainImg ? `https://puppyplace.ng/api/og-img?url=${encodeURIComponent(imgs[0])}` : '';
  const breed    = p.breed || p.type || 'Pet';
  const kind     = String(p.type || 'pet').toLowerCase();
  const youngWord = {dog:'puppy', cat:'kitten', rabbit:'bunny', bird:'bird', fish:'fish'}[kind] || kind;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: titleLead,
    description: p.specs || metaDesc,
    image: imgs,
    url: petUrl,
    sku: p.slug || undefined,
    category: `Live Animals > ${p.type || 'Pets'}`,
    offers: {
      '@type': 'Offer',
      url: petUrl,
      price: isAdopt ? 0 : (p.price || 0),
      priceCurrency: 'NGN',
      availability: 'https://schema.org/InStock',
      areaServed: { '@type': 'Country', name: 'Nigeria' },
      seller: { '@type': 'Organization', name: p.breeder || 'PuppyPlace.ng' },
    },
  }).replace(/<\//g, '<\\/');
  const crumbs = [{ name: 'Home', url: 'https://puppyplace.ng/' }, { name: 'Pets', url: 'https://puppyplace.ng/pets.html' }];
  if (petKind.type) crumbs.push({ name: `${petKind.title} for sale`, url: `https://puppyplace.ng${petsPagePath(petKind, null, false)}` });
  if (petKind.type && petCity) crumbs.push({ name: petCity.name, url: `https://puppyplace.ng${petsPagePath(petKind, petCity, false)}` });
  crumbs.push({ name: breed, url: petUrl });
  const moreLinks = [
    petCity && petKind.type ? [petsPagePath(petKind, petCity, false), `More ${petKind.title.toLowerCase()} for sale in ${petCity.name}`] : null,
    petKind.type ? [petsPagePath(petKind, null, false), `All ${petKind.title.toLowerCase()} for sale in Nigeria`] : null,
    petCity ? [petsPagePath(ALL_PETS_KIND, petCity, false), `All pets for sale in ${petCity.name}`] : ['/pets.html', 'All pets for sale in Nigeria'],
  ].filter(Boolean);

  const I = {
    back:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    heart:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.8 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.2 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20Z"/></svg>',
    left:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    right:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    check:  '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1fa463"/><path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7.5 7.5 0 0 0-7.5 7.5C4.5 15.1 12 22 12 22s7.5-6.9 7.5-12.5A7.5 7.5 0 0 0 12 2Zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z"/></svg>',
    clock:  '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#5b6070"/><path d="M12 7v5l3 2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
    shield: '<svg width="15" height="15" viewBox="0 0 24 24"><path d="M12 2 4 5v6.5c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5l-8-3Z" fill="#1fa463"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ribbon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c25a12" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-2 8 5.5-3 5.5 3-2-8"/></svg>',
    dog:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="#5b6070"><path d="M18.5 3.5c-1 0-1.8.5-2.3 1.3L14.6 7H10l-1.8 3.2L4.6 11c-1 .2-1.6 1.1-1.6 2v1.2c0 .5.4.8.8.8H6l2.5 3.6V21h3v-3l1.5-2h3v5h3v-7.3l1.3-3.4c.5-1.2.7-2.5.7-3.8V5.8c0-1.3-1.1-2.3-2.5-2.3Z"/></svg>',
    wa:     '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3.5 20.5 4.8 16A8.5 8.5 0 1 1 8 19.3l-4.5 1.2Z" stroke-linejoin="round"/><path d="M9 8.3c.2-.5.6-.5.9-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.2 0 .5-.1.7l-.5.6c-.1.2-.1.4 0 .5.5.9 1.3 1.7 2.2 2.2.2.1.4.1.5 0l.6-.6c.2-.2.5-.2.7-.1l1.6.8c.3.1.4.3.4.5 0 .5-.2 1.2-.7 1.5-.6.4-1.5.6-2.6.2-1.5-.5-3-1.6-4.1-3.2-.8-1.1-1.2-2.4-.9-3.3.1-.3.2-.5.2-.6Z" fill="currentColor" stroke="none"/></svg>',
    chat:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5c4.7 0 8.5 3.4 8.5 7.6s-3.8 7.6-8.5 7.6c-1 0-2-.2-2.9-.4L4.5 20l1.2-3.6C4.3 15 3.5 13.1 3.5 11.1 3.5 6.9 7.3 3.5 12 3.5Z"/><circle cx="8.3" cy="11.2" r="1" fill="currentColor"/><circle cx="12" cy="11.2" r="1" fill="currentColor"/><circle cx="15.7" cy="11.2" r="1" fill="currentColor"/></svg>',
    vshield:'<svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2 4 5v6.5c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5l-8-3Z" fill="#1fa463"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    vheart: '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 21s-8.5-5.2-10.4-10.6C.4 6.8 2.8 3.3 6.4 3.3c2.3 0 4.1 1.2 5.6 3.4 1.5-2.2 3.3-3.4 5.6-3.4 3.6 0 6 3.5 4.8 7.1C20.5 15.8 12 21 12 21Z" fill="#1fa463"/><path d="M5.5 11.5h3.2l1.5-2.5 2.3 5 1.7-2.5h4.3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    vusers: '<svg width="30" height="30" viewBox="0 0 24 24" fill="#1fa463"><circle cx="9" cy="7.5" r="3.5"/><path d="M2 19.5c0-3.6 3.1-6 7-6s7 2.4 7 6v.5H2v-.5Z"/><circle cx="17" cy="8.5" r="2.8"/><path d="M17.5 13.2c2.6.3 4.5 2.2 4.5 5V19h-4.3c0-2.2-.8-4.2-2.3-5.6.6-.1 1.4-.2 2.1-.2Z"/></svg>',
    paw:    '<svg width="34" height="34" viewBox="0 0 24 24" fill="#ed6436"><ellipse cx="5.5" cy="10" rx="2.2" ry="2.8"/><ellipse cx="9.5" cy="5.5" rx="2.2" ry="2.9"/><ellipse cx="14.5" cy="5.5" rx="2.2" ry="2.9"/><ellipse cx="18.5" cy="10" rx="2.2" ry="2.8"/><path d="M12 11c-3 0-6.5 4.1-6.5 6.8 0 1.8 1.3 2.7 3 2.7 1.4 0 2.3-.8 3.5-.8s2.1.8 3.5.8c1.7 0 3-.9 3-2.7C18.5 15.1 15 11 12 11Z"/></svg>',
    tips:   '<svg width="38" height="38" viewBox="0 0 24 24"><path d="M12 2 4 5v6.5c0 5 3.4 9 8 10.5 4.6-1.5 8-5.5 8-10.5V5l-8-3Z" fill="#1fa463"/><path d="M12 2v20c-4.6-1.5-8-5.5-8-10.5V5l8-3Z" fill="#17894f"/><path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tick:   '<svg width="26" height="26" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1fa463"/><path d="m7 12.3 3.2 3.2L17 8.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // About-this-pet icons
    aPaw:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="#5b6070"><ellipse cx="5.5" cy="10" rx="2.2" ry="2.8"/><ellipse cx="9.5" cy="5.5" rx="2.2" ry="2.9"/><ellipse cx="14.5" cy="5.5" rx="2.2" ry="2.9"/><ellipse cx="18.5" cy="10" rx="2.2" ry="2.8"/><path d="M12 11c-3 0-6.5 4.1-6.5 6.8 0 1.8 1.3 2.7 3 2.7 1.4 0 2.3-.8 3.5-.8s2.1.8 3.5.8c1.7 0 3-.9 3-2.7C18.5 15.1 15 11 12 11Z"/></svg>',
    aCal:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5b6070" stroke-width="2"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
    aSex:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5b6070" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="13" r="5"/><path d="M10 18v4M8 20h4M13.5 9.5 20 3M15.5 3H20v4.5"/></svg>',
    aPal:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="#5b6070"><path d="M12 2.5a9.5 9.5 0 0 0 0 19c1.3 0 2-.9 2-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1c2.6 0 4.6-2.1 4.6-4.6C21.5 6 17.2 2.5 12 2.5Z"/><circle cx="7" cy="11.5" r="1.5" fill="#fff"/><circle cx="9.5" cy="7.3" r="1.5" fill="#fff"/><circle cx="14.5" cy="7.3" r="1.5" fill="#fff"/><circle cx="17.3" cy="11" r="1.5" fill="#fff"/></svg>',
    aPups:  '<svg width="26" height="26" viewBox="0 0 24 24" fill="#5b6070"><circle cx="12" cy="7" r="3"/><circle cx="5" cy="9" r="2.3"/><circle cx="19" cy="9" r="2.3"/><path d="M6.5 19c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5v1h-11v-1Z"/><path d="M1 18.5c0-2.4 1.7-4.2 4-4.2.6 0 1.2.1 1.7.4A7.5 7.5 0 0 0 5 19.5H1v-1Zm22 0c0-2.4-1.7-4.2-4-4.2-.6 0-1.2.1-1.7.4a7.5 7.5 0 0 1 1.7 4.8h4v-1Z"/></svg>',
    aHeart: '<svg width="26" height="26" viewBox="0 0 24 24" fill="#5b6070"><path d="M12 21s-8.5-5.2-10.4-10.6C.4 6.8 2.8 3.3 6.4 3.3c2.3 0 4.1 1.2 5.6 3.4 1.5-2.2 3.3-3.4 5.6-3.4 3.6 0 6 3.5 4.8 7.1C20.5 15.8 12 21 12 21Z"/></svg>',
    aPin:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="#5b6070"><path d="M12 2a7.5 7.5 0 0 0-7.5 7.5C4.5 15.1 12 22 12 22s7.5-6.9 7.5-12.5A7.5 7.5 0 0 0 12 2Zm0 10.2a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z"/></svg>',
    aRib:   '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#5b6070" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-2 8 5.5-3 5.5 3-2-8"/></svg>',
  };

  // ── Gallery ──
  const galleryHtml = imgs.length
    ? `<div class="pg-main" id="pgMain">
        <img id="pgImg" src="${esc(imgs[0])}" alt="${esc(titleLead)}"/>
        <button class="pg-heart" id="pgHeart" aria-label="Save pet" aria-pressed="false">${I.heart}</button>
        <span class="pg-badge${isAdopt ? ' adopt' : ''}">${isAdopt ? 'Adoption' : 'For Sale'}</span>
        ${imgs.length > 1 ? `<button class="pg-arrow l" onclick="pgNav(-1)" aria-label="Previous photo">${I.left}</button><button class="pg-arrow r" onclick="pgNav(1)" aria-label="Next photo">${I.right}</button>` : ''}
      </div>
      ${imgs.length > 1 ? `<div class="pg-thumbs-row">
        <button class="pg-tarrow" onclick="pgThumbs(-1)" aria-label="Scroll photos left">${I.left}</button>
        <div class="pg-thumbs" id="pgThumbs">${imgs.map((u, i) => `<button class="pg-thumb${i === 0 ? ' on' : ''}" onclick="pgGo(${i})" aria-label="Photo ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy"/></button>`).join('')}</div>
        <button class="pg-tarrow" onclick="pgThumbs(1)" aria-label="Scroll photos right">${I.right}</button>
      </div>` : ''}`
    : `<div class="pg-main pg-emoji" style="background:${bg}">${emoji}
        <button class="pg-heart" id="pgHeart" aria-label="Save pet" aria-pressed="false">${I.heart}</button>
        <span class="pg-badge${isAdopt ? ' adopt' : ''}">${isAdopt ? 'Adoption' : 'For Sale'}</span>
      </div>`;

  // ── Header chips and facts ──
  const pedigreeLabel = p.pedigree ? (p.pedigree === 'pedigree' ? 'Pedigree' : 'Non-Pedigree') : '';
  const chips = [
    p.age ? `<span class="pg-chip">${I.clock}${esc(p.age)}</span>` : '',
    p.dewormed ? `<span class="pg-chip ok">${I.shield}Dewormed</span>` : '',
    p.vaccinated ? `<span class="pg-chip ok">${I.shield}Vaccinated</span>` : '',
    p.pedigree === 'pedigree' ? `<span class="pg-chip ped">${I.ribbon}Pedigree</span>` : '',
  ].join('');

  const gender = petGender(p);
  const colour = petColour(p);
  const litter = petLitter(p);
  const health = [p.dewormed && 'Dewormed', p.vaccinated && 'Vaccinated'].filter(Boolean).join(' and ');
  const facts = [
    ['Breed', breed, I.aPaw],
    p.age && ['Age', p.age, I.aCal],
    gender && ['Gender', gender, I.aSex],
    colour && ['Colour', colour, I.aPal],
    litter && [litter.word, litter.n, I.aPups],
    health && ['Health', health, I.aHeart],
    pedigreeLabel && ['Pedigree', pedigreeLabel, I.aRib],
    p.location && ['Location', p.location, I.aPin],
  ].filter(Boolean);
  // l3 / l2 mark the last row in the three- and two-column layouts, which drop the row rule
  const factsHtml = facts.map(([k, v, ic], i) => `<div class="fact${i >= facts.length - (facts.length % 3 || 3) ? ' l3' : ''}${i >= facts.length - (facts.length % 2 || 2) ? ' l2' : ''}"><span class="fact-ico">${ic}</span><div><div class="fact-k">${esc(k)}</div><div class="fact-v">${esc(v)}</div></div></div>`).join('');

  const seller = p.breeder || 'PuppyPlace.ng';
  const priceHtml = isAdopt
    ? `<div class="pg-price free">Free to adopt</div>`
    : (p.price ? `<div class="pg-price">₦${Number(p.price).toLocaleString('en-NG')}</div>` : `<div class="pg-price ask">Price on request</div>`);

  // The seller's number is not in the page: /pp-contact.js signs the buyer in
  // (a code on WhatsApp) and then opens the chat, or sends a message on the site.
  const contactData = `data-slug="${esc(p.slug)}" data-breed="${esc(breed)}"`;
  const ctaHtml = wa
    ? `<button type="button" class="btn-wa" data-pp-contact="whatsapp" ${contactData}>${I.wa}Contact on WhatsApp</button>
       <button type="button" class="btn-ask" data-pp-contact="message" ${contactData}>${I.chat}Send a message</button>
       <p class="cta-note">Sign in once with your WhatsApp number. Messages here keep your number private.</p>`
    : `<a class="btn-ask" href="/contact.html">${I.chat}Ask a question</a>`;

  const socials = PET_FOOTER_SOCIALS.filter(s => s.url);
  const year = new Date().getUTCFullYear();

  const pageScript = `<script>
(function(){
  var imgs=${JSON.stringify(imgs).replace(/</g, '\\u003c')},idx=0;
  var img=document.getElementById('pgImg');
  function show(){
    if(!img)return;
    img.src=imgs[idx];
    var th=document.querySelectorAll('.pg-thumb');
    th.forEach(function(t,i){t.classList.toggle('on',i===idx);});
    if(th[idx])th[idx].scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
  }
  window.pgGo=function(i){idx=i;show();};
  window.pgNav=function(d){idx=(idx+d+imgs.length)%imgs.length;show();};
  window.pgThumbs=function(d){var t=document.getElementById('pgThumbs');if(t)t.scrollBy({left:d*t.clientWidth*0.8,behavior:'smooth'});};
  if(imgs.length>1){
    document.addEventListener('keydown',function(e){if(e.target.closest&&e.target.closest('input,textarea'))return;if(e.key==='ArrowLeft')pgNav(-1);if(e.key==='ArrowRight')pgNav(1);});
    var main=document.getElementById('pgMain'),x0=null;
    main.addEventListener('touchstart',function(e){x0=e.touches[0].clientX;},{passive:true});
    main.addEventListener('touchend',function(e){if(x0===null)return;var dx=e.changedTouches[0].clientX-x0;if(Math.abs(dx)>40)pgNav(dx<0?1:-1);x0=null;});
  }
  // Saved pets share the pets page's list
  var id=${JSON.stringify(p.id ?? null)},saved=[];
  try{saved=JSON.parse(localStorage.getItem('pp_pet_wish')||'[]');}catch(e){}
  var h=document.getElementById('pgHeart');
  function paint(){var on=saved.indexOf(id)>=0;h.classList.toggle('on',on);h.setAttribute('aria-pressed',on);h.setAttribute('aria-label',on?'Remove from saved':'Save pet');}
  if(h&&id!==null){paint();h.addEventListener('click',function(){var i=saved.indexOf(id);if(i>=0)saved.splice(i,1);else saved.push(id);try{localStorage.setItem('pp_pet_wish',JSON.stringify(saved));}catch(e){}paint();});}
})();
</script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="google-adsense-account" content="ca-pub-4218810555810518">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4218810555810518" crossorigin="anonymous"></script>
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}"/>
<link rel="canonical" href="${petUrl}"/>
<meta property="og:type" content="product"/>
<meta property="og:site_name" content="PuppyPlace.ng"/>
<meta property="og:title" content="${esc(pageTitle)}"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<meta property="og:url" content="${petUrl}"/>
${ogImg ? `<meta property="og:image" content="${escUrl(ogImg)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<script type="application/ld+json">${jsonLd}</script>
<script type="application/ld+json">${breadcrumbLd(crumbs)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--orange:#ed6436;--orange-d:#d9541f;--green:#1fa463;--dark:#121210;--text:#1d1d1b;--gray:#6b6f7a;--light:#f6f7f9;--border:#e8eaee;--r:14px;--shadow:0 2px 12px rgba(16,24,40,.06)}
body{font-family:'Plus Jakarta Sans',sans-serif;background:var(--light);color:var(--text);min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased}
a{text-decoration:none;color:inherit}
button{font-family:inherit}
svg{flex-shrink:0}

.nav{background:var(--dark);padding:0 40px;height:72px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100}
.nav-logo{font-family:'Nunito',sans-serif;color:#fff;font-size:22px;font-weight:900;display:flex;align-items:center;gap:8px}
.nav-logo span{color:var(--orange)}
.nav-links{display:flex;align-items:center;gap:48px;position:absolute;left:50%;transform:translateX(-50%)}
.nav-link{color:#fff;font-size:14px;font-weight:600;height:72px;display:flex;align-items:center;position:relative;transition:color .2s}
.nav-link:hover{color:var(--orange)}
.nav-link.on::after{content:'';position:absolute;left:-10px;right:-10px;bottom:17px;height:2.5px;background:var(--orange);border-radius:2px}
.nav-right{display:flex;align-items:center;gap:20px}
.nav-ico{color:#fff;display:flex;padding:4px;position:relative}
.nav-cnt{position:absolute;top:-4px;right:-6px;background:var(--orange);color:#fff;font:800 10px/17px 'Nunito',sans-serif;min-width:17px;height:17px;border-radius:9px;align-items:center;justify-content:center;padding:0 4px}
.nav-ico:hover{color:var(--orange)}
.nav-cta{background:var(--orange);color:#fff;font-size:14px;font-weight:600;padding:10px 18px;border-radius:50px;transition:background .2s}
.nav-cta:hover{background:var(--orange-d)}

.wrap{max-width:1024px;margin:0 auto;width:100%;padding:0 40px}
.back{display:inline-flex;align-items:center;gap:10px;font-size:14px;font-weight:500;color:var(--text);margin:24px 0 22px}
.back:hover{color:var(--orange)}
.card{background:#fff;border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow)}

.top{display:grid;grid-template-columns:480px minmax(0,1fr);gap:8px;align-items:start}
.top>*{min-width:0}
.gallery{padding:12px}
.pg-main{position:relative;border-radius:12px;overflow:hidden;aspect-ratio:454/484;background:#f1f2f4;touch-action:pan-y}
.pg-main img{width:100%;height:100%;object-fit:cover;display:block}
.pg-emoji{display:flex;align-items:center;justify-content:center;font-size:110px}
.pg-heart{position:absolute;top:8px;left:8px;width:40px;height:40px;border-radius:50%;border:none;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.15);transition:transform .15s}
.pg-heart:hover{transform:scale(1.08)}
.pg-heart.on{color:var(--orange)}.pg-heart.on path{fill:currentColor}
.pg-badge{position:absolute;top:14px;right:12px;background:var(--orange);color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;padding:5px 14px;border-radius:50px}
.pg-badge.adopt{background:var(--green)}
.pg-arrow{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:none;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.15)}
.pg-arrow.l{left:8px}.pg-arrow.r{right:8px}
.pg-thumbs-row{display:flex;align-items:center;gap:10px;margin-top:14px}
.pg-tarrow{width:32px;height:32px;border-radius:50%;border:none;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);box-shadow:0 1px 6px rgba(0,0,0,.12);flex-shrink:0}
.pg-thumbs{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0;padding:2px}
.pg-thumbs::-webkit-scrollbar{display:none}
.pg-thumb{flex:0 0 82px;height:76px;border-radius:6px;overflow:hidden;border:2px solid transparent;padding:0;background:#f1f2f4;cursor:pointer;transition:border-color .2s}
.pg-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.pg-thumb.on{border-color:var(--orange)}

.info{padding:6px 20px 20px}
.info-badge{display:inline-block;background:var(--orange);color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;padding:5px 14px;border-radius:50px;margin-bottom:12px}
.info-badge.adopt{background:var(--green)}
.info-type{font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;color:#8a8d94;margin-bottom:2px}
.info h1{font-size:36px;font-weight:800;line-height:1.15;letter-spacing:-.01em;color:#111;margin-bottom:12px}
.seller{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;margin-bottom:8px}
.avatar{width:26px;height:26px;border-radius:50%;background:#fde3d8;color:var(--orange);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800}
.loc{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--gray);margin-bottom:16px;padding-left:4px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.pg-chip{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 14px;border-radius:50px;border:1px solid var(--border);background:#f8f9fb;font-size:13px;font-weight:500;color:var(--text)}
.pg-chip.ok{background:#eefaf3;border-color:#9fdcb9;color:var(--green);font-size:12px}
.pg-chip.ped{background:#fff6ee;border-color:#f5c9a5;color:#c25a12;font-size:12px}
.specs{display:flex;gap:14px;align-items:flex-start;background:#f6f7f9;border:1px solid var(--border);border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.6;color:var(--text);white-space:pre-line;margin-bottom:18px}
.specs svg{margin-top:1px}
.divider{height:1px;background:var(--border);margin-bottom:16px}
.pg-price{font-size:38px;font-weight:800;color:var(--orange);letter-spacing:-.01em;margin-bottom:14px}
.pg-price.free{color:var(--green);font-size:32px}
.pg-price.ask{color:var(--text);font-size:26px}
.btn-wa,.btn-ask{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:50px;border-radius:50px;font:700 16px 'Nunito',sans-serif;border:0;cursor:pointer;transition:all .2s}
.btn-wa:disabled,.btn-ask:disabled{opacity:.6;cursor:wait}
.cta-note{margin:-12px 0 22px;font-size:12.5px;color:#868686;text-align:center;line-height:1.5}
.btn-wa{background:#22c35e;color:#fff;margin-bottom:12px}
.btn-wa:hover{background:#1aa850}
.btn-ask{border:1.5px solid var(--orange);color:var(--orange);background:#fff;margin-bottom:22px}
.btn-ask:hover{background:var(--orange);color:#fff}
.assure{display:grid;grid-template-columns:auto auto auto;justify-content:space-between;background:#f0faf5;border:1px solid #d5efe1;border-radius:10px;padding:14px 8px}
.assure div{display:flex;align-items:center;gap:9px;padding:0 10px;font-size:12px;line-height:1.6;color:var(--text);white-space:nowrap}
.assure svg{width:27px;height:27px}
.assure div+div{border-left:1px solid #d5efe1}

.section{margin-top:36px;padding:22px 22px 18px}
.sec-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:24px}
.sec-head h2{font-size:24px;font-weight:800;color:#111;line-height:1.25}
.sec-head p{font-size:14px;color:var(--gray);margin-top:6px}
.facts{display:grid;grid-template-columns:repeat(3,1fr)}
.fact{display:flex;gap:16px;align-items:flex-start;padding:16px 4px 20px;position:relative;border-bottom:1px solid var(--border)}
.fact.l3{border-bottom:none}
.fact:not(:nth-child(3n+1))::before{content:'';position:absolute;left:-12px;top:12px;bottom:12px;width:1px;background:var(--border)}
.fact:not(:nth-child(3n+1)){padding-left:34px}
.fact-k{font-size:14px;color:var(--gray);margin-bottom:4px}
.fact-v{font-size:16px;font-weight:500;color:var(--text)}
.fact-ico{width:26px;display:flex;justify-content:center;margin-top:2px}

.guide-body{padding:0 4px 4px 46px;font-size:14px;line-height:1.75;color:#3b3e46}
.guide-body p+p{margin-top:10px}
.guide-body strong{color:#111}
.safety{margin-top:36px;padding:22px 22px 24px;margin-bottom:20px}
.more{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:34px}
.more a{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--text);background:#fff;border:1px solid var(--border);border-radius:50px;padding:9px 16px;transition:all .2s}
.more a:hover{border-color:var(--orange);color:var(--orange)}
.more svg{width:14px;height:14px}
.tips{display:grid;grid-template-columns:repeat(4,1fr)}
.tip{display:flex;gap:16px;align-items:center;padding:4px 16px;font-size:12.5px;line-height:1.7;color:#3b3e46}
.tip+.tip{border-left:1px solid var(--border)}
.tip:first-child{padding-left:10px}

.footer{background:var(--dark);color:rgba(255,255,255,.75);margin-top:auto;padding:24px 0 22px}
.f-top{display:flex;align-items:center;justify-content:space-between;gap:24px;padding-bottom:22px;border-bottom:1px solid rgba(255,255,255,.12)}
.f-brand .nav-logo{font-size:22px}
.f-tag{font-size:12px;color:rgba(255,255,255,.6);margin-top:4px}
.f-links{display:flex;gap:32px;font-size:13px;font-weight:500;color:#fff}
.f-links a:hover{color:var(--orange)}
.f-social{display:flex;gap:12px;min-width:160px;justify-content:flex-end}
.f-social a{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;color:#fff}
.f-social a:hover{background:var(--orange)}
.f-bot{display:flex;justify-content:space-between;gap:16px;padding-top:18px;font-size:12px;color:rgba(255,255,255,.7)}
.flag{display:inline-flex;width:18px;height:12px;margin-left:8px;vertical-align:-1px;border-radius:1px;overflow:hidden}
.flag i{flex:1;background:#008751}.flag i:nth-child(2){background:#fff}

@media(max-width:1000px){
  .nav{padding:0 24px}.nav-links{gap:28px}
  .wrap{padding:0 24px}
  .top{grid-template-columns:1fr 1fr;gap:16px}
  .info h1{font-size:30px}
  .assure{grid-template-columns:1fr;gap:10px;padding:12px;justify-content:stretch}
  .assure div+div{border-left:none}
  .tips{grid-template-columns:1fr 1fr;row-gap:16px}
  .tip:nth-child(3){border-left:none;padding-left:10px}
  .f-top{flex-wrap:wrap}
}
@media(max-width:760px){
  .nav{height:60px;padding:0 16px}
  .nav-links{display:none}
  .nav-right{gap:14px}
  .nav-cta{padding:8px 14px;font-size:12px}
  .wrap{padding:0 16px}
  .back{margin:16px 0 14px}
  .top{grid-template-columns:1fr;gap:14px}
  .gallery{padding:10px}
  .pg-main{aspect-ratio:1/1}
  .pg-thumb{flex-basis:70px;height:64px}
  .info{padding:18px 16px 18px}
  .info h1{font-size:28px}
  .pg-price{font-size:32px}
  .assure{grid-template-columns:1fr 1fr 1fr;gap:0;padding:12px 4px}
  .assure div{white-space:normal}
  .assure div{flex-direction:column;text-align:center;gap:6px;padding:0 6px;font-size:11px;line-height:1.4}
  .assure div+div{border-left:1px solid #d5efe1}
  .section,.safety{margin-top:20px;padding:18px 16px 14px}
  .sec-head h2{font-size:20px}
  .guide-body{padding-left:0}
  .sec-head p{font-size:13px}
  .facts{grid-template-columns:1fr 1fr}
  .fact,.fact:not(:nth-child(3n+1)){padding:14px 4px 16px}
  .fact::before{display:none}
  .fact:nth-child(even){padding-left:16px;border-left:1px solid var(--border)}
  .fact.l3{border-bottom:1px solid var(--border)}
  .fact.l2{border-bottom:none}
  .fact-v{font-size:15px}
  .tips{grid-template-columns:1fr;row-gap:0}
  .tip,.tip:first-child,.tip:nth-child(3){padding:10px 0;border-left:none}
  .tip+.tip{border-top:1px solid var(--border);border-left:none}
  .safety{margin-bottom:14px}
  .more{margin-bottom:24px}
  .f-top{flex-direction:column;align-items:flex-start;gap:16px}
  .f-links{gap:20px;flex-wrap:wrap}
  .f-social{justify-content:flex-start;min-width:0}
  .f-bot{flex-direction:column;gap:6px}
}
@media(max-width:480px){.nav-logo{font-size:18px;white-space:nowrap;gap:6px}.nav-right{gap:10px}.nav-cta{padding:7px 11px;white-space:nowrap}}
@media(max-width:380px){.nav-cta{display:none}}
</style>
</head>
<body>
<nav class="nav">
  <a class="nav-logo" href="/">🐾 Puppy<span>Place</span></a>
  <div class="nav-links">
    <a class="nav-link" href="/">Home</a>
    <a class="nav-link" href="/shop.html">Shop</a>
    <a class="nav-link on" href="/pets.html">Pets</a>
    <a class="nav-link" href="/blog.html">Blog</a>
  </div>
  <div class="nav-right">
    <a class="nav-ico" href="/pets.html#search" aria-label="Search pets"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></a>
    <a class="nav-ico" href="/pets.html#saved" aria-label="Saved pets">${I.heart.replace('width="20" height="20"', 'width="22" height="22"')}</a>
    <a class="nav-ico" href="/messages.html" data-pp-inbox aria-label="Messages"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="nav-cnt" data-pp-inbox-count style="display:none">0</span></a>
    <a class="nav-cta" href="/contact.html">Contact Us</a>
  </div>
</nav>

<main class="wrap">
  <a class="back" href="/pets.html">${I.back}Back to Pets</a>

  <div class="top">
    <div class="card gallery">${galleryHtml}</div>
    <div class="card info">
      <span class="info-badge${isAdopt ? ' adopt' : ''}">${isAdopt ? 'For Adoption' : 'For Sale'}</span>
      <div class="info-type">${esc(p.type || 'Pet')}</div>
      <h1>${esc(breed)}</h1>
      <div class="seller"><span class="avatar">${esc(seller.trim().charAt(0).toUpperCase())}</span>${esc(seller)}${I.check}</div>
      ${p.location ? `<div class="loc">${I.pin}${esc(p.location)}</div>` : ''}
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      ${p.specs ? `<div class="specs">${p.type === 'Dog' ? I.dog : I.aPaw.replace(/26/g, '22')}<div>${esc(p.specs)}</div></div>` : ''}
      <div class="divider"></div>
      ${priceHtml}
      ${ctaHtml}
      <div class="assure">
        <div>${I.vshield}<span>Verified<br/>listing</span></div>
        <div>${I.vheart}<span>Health information<br/>provided</span></div>
        <div>${I.vusers}<span>Talk directly<br/>to seller</span></div>
      </div>
    </div>
  </div>

  <section class="card section">
    <div class="sec-head">${I.paw}<div><h2>About this pet</h2><p>Get all the important details about this ${esc(breed)} ${esc(youngWord)}.</p></div></div>
    <div class="facts">${factsHtml}</div>
  </section>

  ${guide ? renderGuide(breed, guide) : ''}

  <section class="card safety">
    <div class="sec-head">${I.tips}<div><h2>Safety tips when buying a pet</h2><p>Keep yourself and your new pet safe with these simple tips.</p></div></div>
    <div class="tips">
      <div class="tip">${I.tick}<span>Meet the seller in a safe,<br/>public location.</span></div>
      <div class="tip">${I.tick}<span>Ask for health records<br/>and vaccination proof.</span></div>
      <div class="tip">${I.tick}<span>Don’t pay any money,<br/>not even a deposit,<br/>before seeing the pet.</span></div>
      <div class="tip">${I.tick}<span>Trust your instincts.<br/>If it feels off, walk away.</span></div>
    </div>
  </section>

  <nav class="more" aria-label="More pets">${moreLinks.map(([href, label]) => `<a href="${href}">${esc(label)} ${I.right}</a>`).join('')}</nav>
</main>

<footer class="footer">
  <div class="wrap">
    <div class="f-top">
      <div class="f-brand"><a class="nav-logo" href="/">🐾 Puppy<span>Place</span></a><div class="f-tag">Healthy Pets. Happy Homes.</div></div>
      <nav class="f-links"><a href="/">Home</a><a href="/shop.html">Shop</a><a href="/pets.html">Pets</a><a href="/blog.html">Blog</a><a href="/contact.html">Contact</a></nav>
      <div class="f-social">${socials.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="${esc(s.name)}"><svg width="15" height="15" viewBox="0 0 24 24">${s.icon}</svg></a>`).join('')}</div>
    </div>
    <div class="f-bot"><span>© ${year} PuppyPlace. All rights reserved.</span><span>Trusted by pet lovers across Nigeria<span class="flag" aria-hidden="true"><i></i><i></i><i></i></span></span></div>
  </div>
</footer>
${pageScript}
<script src="/pp-auth.js" defer></script><script src="/pp-contact.js" defer></script><script src="/pp-inbox.js" defer></script>
<script>(function(){try{if(localStorage.getItem('pp_notrack'))return;}catch(e){}document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="wa.me"]');if(!a)return;var v=JSON.stringify({event:'whatsapp_click',path:location.pathname});if(navigator.sendBeacon)navigator.sendBeacon('/api/track-event',v);},true);})();</script>
<script>(function(){var s=Date.now(),p=location.pathname;try{if(localStorage.getItem('pp_notrack'))return;}catch(e){}var v=JSON.stringify({path:p,ref:document.referrer});if(navigator.sendBeacon)navigator.sendBeacon('/api/track-view',v);else fetch('/api/track-view',{method:'POST',body:v,keepalive:true}).catch(function(){});function send(){var t=Math.round((Date.now()-s)/1000);if(t<2||!navigator.sendBeacon)return;navigator.sendBeacon('/api/track-time',JSON.stringify({path:p,secs:t}));}document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send();});window.addEventListener('pagehide',send);})();</script>
</body>
</html>`;
}

// Near-duplicate posts merged into one (supabase/merge_duplicate_posts.sql unpublishes
// the duplicates). Once a duplicate is unpublished its address 301s to the post
// kept; most of these names are too different for closestSlug to find it.
const MERGED_POSTS = {
  'how-to-treat-low-blood-anemia-in-dogs-nigeria': 'how-to-treat-low-blood-anemia-in-dogs',
  'best-foods-to-increase-blood-in-dogs-naturally': 'best-blood-building-foods-for-dogs-and-cats-nigeria',
  'silent-killer-for-cats-kidney-disease-symptoms-prevention': 'what-is-the-silent-killer-of-cats-chronic-kidney-disease-symptoms',
  'silent-killer-of-cats-kidney-disease-symptoms-prevention': 'what-is-the-silent-killer-of-cats-chronic-kidney-disease-symptoms',
  'understanding-the-3-3-3-rule-for-adjusting-new-cats': 'what-is-the-3-3-3-rule-for-cat-acclimation',
  'understanding-the-3-3-3-rule-for-cat-adjustment': 'what-is-the-3-3-3-rule-for-cat-acclimation',
  'how-to-make-homemade-kitten-milk-replacer-formula-emergency': 'how-to-make-homemade-kitten-milk-replacer-emergency',
  'cost-of-professional-dog-training-nigeria': 'cost-of-dog-training-in-nigeria-price-guide',
  'cost-to-train-a-dog-in-nigeria-price-guide': 'cost-of-dog-training-in-nigeria-price-guide',
  'cost-to-train-a-dog-nigeria': 'cost-of-dog-training-in-nigeria-price-guide',
  'essential-vitamins-and-supplements-for-senior-dogs': 'best-vitamins-and-supplements-for-senior-dogs',
  'dog-foaming-at-mouth-and-shaking-emergency-causes': 'dog-foaming-at-the-mouth-causes-emergency-nigeria',
  'how-to-tell-if-dog-diarrhea-is-serious-emergency': 'how-to-know-if-dog-diarrhea-is-serious-emergency-signs',
  'safe-home-remedies-for-dog-toothpaste-natural-alternatives': 'safe-dog-toothpaste-alternatives-natural-home-remedies',
  'toxic-ingredients-in-human-toothpaste-for-dogs': 'what-happens-if-dog-licks-toothpaste-toxicity-guide',
  'guide-on-how-to-stimulate-kitten-to-pee-and-poop': 'how-to-help-newborn-kitten-pee-and-poop-safely',
  'how-to-stimulate-a-newborn-kitten-to-poop-at-home': 'how-to-help-newborn-kitten-pee-and-poop-safely',
  '10-most-toxic-foods-for-dogs-and-how-to-avoid-poisoning': 'complete-guide-to-poisonous-and-toxic-foods-for-dogs',
  'most-dangerous-poisonous-foods-for-dogs-guide': 'complete-guide-to-poisonous-and-toxic-foods-for-dogs',
  'best-deworming-medicines-for-dogs-guide': 'best-dog-deworming-drug-brands-nigeria',
  'best-medications-and-home-care-for-dog-tick-fever': 'best-medicine-for-tick-fever-in-dogs-nigeria-treatment',
  'what-kills-parvovirus-on-surfaces-cleaning-guide': 'what-kills-parvo-the-fastest-disinfectants-treatment',
  'safety-risks-benefits-raw-meat-diet-dogs': 'comprehensive-guide-to-safe-raw-meats-for-dogs-nigeria',
  'what-raw-meat-can-dogs-not-eat-safe-feeding-guide': 'comprehensive-guide-to-safe-raw-meats-for-dogs-nigeria',
  'why-dogs-shouldnt-eat-raw-meat-risks-nigeria': 'comprehensive-guide-to-safe-raw-meats-for-dogs-nigeria',
  'how-to-train-dog-for-loose-leash-walking': 'how-to-teach-dog-not-to-pull-on-leash-guide',
  'german-shepherd-normal-price-and-ownership-costs': 'cost-of-german-shepherd-puppy-nigeria-naira-price',
  'cost-of-veterinary-services-and-clinics-nigeria': 'vet-visit-cost-nigeria-price-guide',
  'dog-flea-medicine-on-cat-risks': 'what-happens-if-you-put-dog-flea-medicine-on-a-cat',
  'treatment-and-cure-for-dog-pooping-blood': 'what-can-i-give-my-dog-to-stop-pooping-blood-treatment-guide',
  'can-dog-recover-from-pancreatitis-treatment-recovery-guide': 'how-to-heal-pancreatitis-in-dogs-fast-recovery-guide',
  'factors-that-make-dog-high-risk-for-anesthesia': 'how-risky-is-anesthesia-for-dogs-safety-guide',
  'what-to-do-if-your-puppy-gets-worms': 'how-to-get-rid-of-dog-worms-in-puppies-nigeria',
  'how-to-kill-ticks-on-dogs-immediately-safe-nigeria-guide': 'how-to-get-rid-of-ticks-on-dogs-in-nigeria-treatment-prevention',
  'signs-your-pet-is-suffering-emergency-guide': 'signs-your-pet-needs-immediate-vet-attention',
  'how-to-safely-flush-poison-out-of-a-cat-emergency-guide': 'how-to-treat-poisoned-cat-at-home-emergency-guide',
};
async function servePost(slug, env) {
  if (!env.SUPABASE_URL) {
    return html(errorPage('Server not configured.'), 503);
  }

  let post, all;
  try {
    [post, all] = await Promise.all([
      getBlogPost(slug, env),
      getAllPosts(env).catch(() => []),
    ]);
  } catch (e) {
    console.error('post ' + slug + ':', e.message);
    return tryLater(errorPage('Failed to load article.'));
  }
  if (!post) {
    const key = slug.trim().toLowerCase();
    if (Object.hasOwn(MERGED_POSTS, key)) return Response.redirect(`https://puppyplace.ng${postPath({ slug: MERGED_POSTS[key] })}`, 301);
    const match = closestSlug(slug, all.map(p => p.slug).filter(Boolean));
    if (match) return Response.redirect(`https://puppyplace.ng${postPath({ slug: match })}`, 301);
    return html(notFoundPage(), 404);
  }
  if (post.slug && slug !== post.slug) {
    return Response.redirect(`https://puppyplace.ng${postPath(post)}`, 301);
  }

  // Related: same category first, topped up with the latest posts
  const cat = blogCategory(post);
  const others = all.filter(p => p.id !== post.id);
  const related = [...others.filter(p => blogCategory(p).slug === cat.slug), ...others.filter(p => blogCategory(p).slug !== cat.slug)].slice(0, 3);
  const products = await getShopProducts(env).catch(() => []);

  return html(renderPost(post, related, matchProducts(post, products)), 200);
}

// Blog posts live in the Supabase blog_posts table
// Main blog categories. Posts saved as "General" (or with no category) are
// placed by their title, so every post lands in one of these.
const BLOG_CATS = [
  { slug: 'poisoning-first-aid', name: 'Poisoning & First Aid', emoji: '⚠️', color: '#c0392b',
    intro: 'What to do when your pet eats something toxic, is bitten by a snake or toad, or is given human medicine.',
    re: /\b(poison\w*|toxic\w*|dangers?|dangerous|deadly|snake ?bites?|snakes?|toads?|rat (poison|killer)|paracetamol|panadol|painkillers?|human (antibiotics?|medicines?|multivitamins?|vitamins?|painkillers?|anti-?diarrh\w*)|antibiotics?|amoxicillin|flagyl|first aid)\b/ },
  { slug: 'fleas-ticks-worms',  name: 'Fleas, Ticks & Worms', emoji: '🐛', color: '#8e6e53',
    intro: 'Getting rid of fleas, ticks, mange and worms — safe treatments and prevention for dogs and cats in Nigeria.',
    re: /\b(fleas?|flea comb|ticks?|tick fever|worms?|deworm\w*|tapeworms?|mange|mites?|lice)\b/ },
  { slug: 'health',             name: 'Health & Emergencies', emoji: '🩺', color: '#e74c3c',
    intro: 'Symptoms, first aid, poisoning, parasites and when to see a vet — practical health guides for pets in Nigeria.',
    re: /\b(health\w*|vets?|veterinar\w*|sick\w*|ill|illness|diseases?|symptoms?|emergenc\w*|first aid|poison\w*|toxic\w*|dangers?|deadly|vomit\w*|diarrh\w*|stool\w*|pooping|blood\w*|bleed\w*|anemia|anaemia|worms?|deworm\w*|tapeworms?|fleas?|ticks?|tick fever|mange|parvo\w*|fever|infections?|antibiotics?|medicines?|medication|paracetamol|panadol|painkillers?|amoxicillin|flagyl|vitamins?|multivitamins?|supplements?|vaccin\w*|pancreatitis|snake ?bites?|snakes?|toads?|rat (poison|killer)|not eating|stops? eating|appetite|weak|shaking|seizures?|coughing|sneez\w*|eye infection|ears?|skin|itch\w*|wounds?|injur\w*|pain|recover\w*|treat(ment)?s? for|how to treat|cure)\b/ },
  { slug: 'food-nutrition',     name: 'Food & Nutrition', emoji: '🍖', color: '#f39c12',
    intro: 'What to feed dogs, cats and other pets — safe Nigerian foods, diets, treats and feeding schedules.',
    re: /\b(foods?|feed\w*|diet\w*|eat|eats|eating|nutrition\w*|treats|milk|meals?|kibble|garri|eba|fufu|rice|meat|bones?|fish|eggs?|fruits?|vegetables?|calories|wet food|dry food|formula)\b/ },
  { slug: 'grooming',           name: 'Grooming & Hygiene', emoji: '🛁', color: '#3498db',
    intro: 'Bathing, brushing, nail trims, dental care and keeping your pet clean and comfortable.',
    re: /\b(groom\w*|bath\w*|bathe|soaps?|shampoo\w*|morning fresh|brush\w*|nails?|fur|coat|shed\w*|teeth|tooth\w*|dental|hygiene)\b/ },
  { slug: 'training-behaviour', name: 'Training & Behaviour', emoji: '🎓', color: '#27ae60',
    intro: 'Training tips and what your pet’s behaviour means — barking, chewing, anxiety, house training and more.',
    re: /\b(train\w*|bark\w*|behaviou?r\w*|aggress\w*|anxiety|anxious|stress\w*|happy|unhappy|depress\w*|grumpy|hid(e|es|ing)|bit(e|es|ing)|chew\w*|potty|litter[- ]train\w*|obedien\w*|commands?|socializ\w*|socialis\w*|rules?)\b/ },
  { slug: 'puppy-kitten-care',  name: 'Puppy & Kitten Care', emoji: '🍼', color: '#9b59b6',
    intro: 'Caring for newborn, young and orphaned puppies and kittens, and for pregnant dogs and cats.',
    re: /\b(newborns?|orphan\w*|pregnan\w*|wean\w*|whelp\w*|birth|\d+[- ]?(day|week)[- ]old|pupp(y|ies)|kittens?)\b/ },
  { slug: 'breeds-buying',      name: 'Breeds & Buying', emoji: '🐕', color: '#16a085',
    intro: 'Breed guides, prices in Nigeria and what to know before you buy or adopt a pet.',
    re: /\b(prices?|cost\w*|breeds?|buy\w*|adopt\w*|choos\w*|for sale|german shepherd|boerboel|rottweiler|caucasian|lhasa|chihuahua|pit ?bull|husky|persian)\b/ },
];
const BLOG_CAT_FALLBACK = { slug: 'pet-care', name: 'Pet Care Tips', emoji: '🐾', color: '#ed6436',
  intro: 'Everyday advice for looking after dogs, cats and other pets in Nigeria.' };
BLOG_CATS.push(BLOG_CAT_FALLBACK);
// Specific baby-animal topics (newborn, orphaned, pregnant) win over everything;
// otherwise the first matching topic below decides
const BABY_RE = /\b(newborns?|orphan\w*|abandoned|pregnan\w*|wean\w*|whelp\w*|birth|formula|(\d+|one|two|three|four|five|six)[- ]?(day|week)s?[- ]old)\b/;
const CAT_ORDER = ['poisoning-first-aid', 'fleas-ticks-worms', 'grooming', 'health', 'food-nutrition', 'training-behaviour', 'breeds-buying', 'puppy-kitten-care'];

function blogCategory(p) {
  // A post saved with one of the main category names (the admin editor
  // suggests them) keeps it; anything else is placed by its title
  const saved = String(p.category || '').toLowerCase().trim();
  const chosen = saved && BLOG_CATS.find(c => c.name.toLowerCase() === saved);
  if (chosen) return chosen;
  const text = [p.title, p.focus_keyword, String(p.slug || '').replace(/-/g, ' ')].filter(Boolean).join(' ').toLowerCase();
  if (BABY_RE.test(text)) return BLOG_CATS.find(c => c.slug === 'puppy-kitten-care');
  for (const slug of CAT_ORDER) {
    const c = BLOG_CATS.find(x => x.slug === slug);
    if (c.re.test(text)) return c;
  }
  return BLOG_CAT_FALLBACK;
}

function blogCatPath(c) {
  return `/blog/${c.slug}.html`;
}

// All published posts (list fields), cached briefly per Worker instance
let _postsCache = { at: 0, posts: null };
async function getAllPosts(env) {
  if (_postsCache.posts && Date.now() - _postsCache.at < 5 * 60 * 1000) return _postsCache.posts;
  const posts = await getBlogPosts(env, { limit: 5000 });
  _postsCache = { at: Date.now(), posts };
  return posts;
}

const BLOG_PER_PAGE = 24;

async function serveBlogIndex(url, env, cat) {
  let posts;
  try {
    posts = await getAllPosts(env);
  } catch (e) {
    console.error('blog index:', e.message);
    return tryLater(errorPage('Failed to load the blog.'));
  }
  const counts = {};
  for (const p of posts) { const c = blogCategory(p).slug; counts[c] = (counts[c] || 0) + 1; }
  const list = cat ? posts.filter(p => blogCategory(p).slug === cat.slug) : posts;
  const pages = Math.max(1, Math.ceil(list.length / BLOG_PER_PAGE));
  const page = Math.max(1, parseInt(url.searchParams.get('page'), 10) || 1);
  if (page > pages) return notFound(url, env);
  const basePath = cat ? blogCatPath(cat) : '/blog.html';
  const pageUrl = n => `${basePath}${n > 1 ? `?page=${n}` : ''}`;
  if (url.searchParams.has('page') && page === 1) return Response.redirect(`https://puppyplace.ng${basePath}`, 301);

  const cards = list.slice((page - 1) * BLOG_PER_PAGE, page * BLOG_PER_PAGE).map((p, i) => {
    const c = blogCategory(p);
    const date = p.published_at
      ? new Date(p.published_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const thumb = p.featured_image
      ? `<img src="${esc(p.featured_image)}" alt="${esc(p.title)}"${i > 2 ? ' loading="lazy"' : ''}/>`
      : `<div class="post-card-thumb-emoji" style="background:${esc(p.bg_color || '#f1f3f5')}">${esc(p.emoji || c.emoji)}</div>`;
    return `
  <a class="post-card" href="${esc(postPath(p))}">
    <div class="post-card-thumb">
      ${thumb}
      <div class="post-card-cat" style="background:${c.color}">${esc(c.name)}</div>
    </div>
    <div class="post-card-body">
      <h2 class="post-card-title">${esc(p.title)}</h2>
      <div class="post-card-excerpt">${esc(p.excerpt || '')}</div>
      <div class="post-card-meta">
        ${p.author ? `<span>${esc(p.author)}</span><span>·</span>` : ''}
        <span>${esc(date)}</span>
        <span>·</span>
        <span>${esc(String(p.read_time || 5))} min read</span>
      </div>
      <div class="post-card-read">Read article →</div>
    </div>
  </a>`;
  }).join('');

  const chips = [
    `<a class="cat-chip${cat ? '' : ' on'}" href="/blog.html">🐾 All Posts <span class="cat-chip-n">${posts.length}</span></a>`,
    ...BLOG_CATS.filter(c => counts[c.slug]).map(c =>
      `<a class="cat-chip${cat && cat.slug === c.slug ? ' on' : ''}" href="${blogCatPath(c)}">${c.emoji} ${esc(c.name)} <span class="cat-chip-n">${counts[c.slug]}</span></a>`),
  ].join('\n    ');
  const catNav = `<nav class="cat-nav" aria-label="Blog categories">\n  <div class="cat-nav-inner">\n    ${chips}\n  </div>\n</nav>`;

  let pager = '';
  if (pages > 1) {
    const items = [];
    if (page > 1) items.push(`<a href="${pageUrl(page - 1)}" rel="prev">← Prev</a>`);
    for (let n = 1; n <= pages; n++) {
      if (n === 1 || n === pages || Math.abs(n - page) <= 2) items.push(n === page ? `<span class="on">${n}</span>` : `<a href="${pageUrl(n)}">${n}</a>`);
      else if (Math.abs(n - page) === 3) items.push('<span>…</span>');
    }
    if (page < pages) items.push(`<a href="${pageUrl(page + 1)}" rel="next">Next →</a>`);
    pager = `<nav class="pager" aria-label="Pages">${items.join('')}</nav>`;
  }

  const name = cat ? cat.name : 'Pet Care Blog';
  const pageSuffix = page > 1 ? ` — Page ${page}` : '';
  const title = cat ? `${cat.name}: Pet Care Guides for Nigeria${pageSuffix} | PuppyPlace Blog` : `Pet Care Blog for Nigerian Pet Owners${pageSuffix} | PuppyPlace`;
  const intro = cat ? cat.intro : 'Expert tips, nutrition guides, health advice, and training insights for Nigerian pet owners';
  const description = cat
    ? `${cat.intro} ${list.length} articles from PuppyPlace.ng.`
    : 'Pet care tips, nutrition guides, health advice and training insights for Nigerian dog, cat and pet owners from the PuppyPlace.ng team.';
  const crumbs = [{ name: 'Home', url: 'https://puppyplace.ng/' }, { name: 'Blog', url: 'https://puppyplace.ng/blog.html' }];
  if (cat) crumbs.push({ name: cat.name, url: `https://puppyplace.ng${blogCatPath(cat)}` });
  const headExtra = `<meta property="og:type" content="website"/>
<meta property="og:site_name" content="PuppyPlace"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="https://puppyplace.ng${pageUrl(page)}"/>
<script type="application/ld+json">${breadcrumbLd(crumbs)}</script>`;

  const fill = {
    CANONICAL: `https://puppyplace.ng${pageUrl(page)}`,
    TITLE: esc(title),
    DESCRIPTION: esc(description),
    HEAD_EXTRA: headExtra,
    H1: esc(cat ? `${cat.emoji} ${name}` : name) + (page > 1 ? ` <small style="font-size:.5em;opacity:.6">Page ${page}</small>` : ''),
    INTRO: esc(intro),
    CATNAV: catNav,
    POSTS: cards || `<div class="empty-state"><div class="empty-state-ico">📝</div><div style="font-size:18px;font-weight:800;margin-bottom:8px">No posts yet</div><div>Check back soon for pet care tips and guides.</div></div>`,
    PAGER: pager,
  };
  const out = BLOG_TEMPLATE.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
  return new Response(out, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

function breadcrumbLd(items) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  }).replace(/<\//g, '<\\/');
}

// Closest live slug for a removed or renamed page (word overlap), so old
// links from Google land on the matching page instead of a 404
function closestSlug(slug, candidates, min = 0.75) {
  const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1));
  const a = words(slug);
  if (a.size < 2) return null;
  let best = null, bestScore = 0;
  for (const c of candidates) {
    const b = words(c);
    if (!b.size) continue;
    let shared = 0;
    for (const t of a) if (b.has(t)) shared++;
    const score = (2 * shared) / (a.size + b.size);
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= min ? best : null;
}

const BLOG_LIST_FIELDS = 'id,slug,title,category,cat_color,emoji,bg_color,excerpt,author,published_at,read_time,featured_image';

async function getBlogPosts(env, { limit = 100, excludeSlug = '', category = '' } = {}) {
  if (!env.SUPABASE_URL) return [];
  const exclude = excludeSlug ? `&slug=neq.${encodeURIComponent(excludeSlug)}` : '';
  const cat = category ? `&category=eq.${encodeURIComponent(category)}` : '';
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/blog_posts?status=eq.published${exclude}${cat}&select=${BLOG_LIST_FIELDS}&order=published_at.desc&limit=${limit}`,
    { headers: sbPublicHeaders(env) }
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) || [];
}

async function getBlogPost(slug, env) {
  // Exact slug first; then the trimmed/lower-cased slug; then the post id
  // (older links and posts saved without a slug use the id)
  const clean = slug.trim().toLowerCase();
  const filters = [`slug=eq.${encodeURIComponent(slug)}`];
  if (clean && clean !== slug) filters.push(`slug=eq.${encodeURIComponent(clean)}`);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean) || /^\d+$/.test(clean)) {
    filters.push(`id=eq.${encodeURIComponent(clean)}`);
  }
  for (const f of filters) {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/blog_posts?${f}&status=eq.published&select=*&limit=1`,
      { headers: sbPublicHeaders(env) }
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    if (rows && rows.length) return rows[0];
  }
  return null;
}

// Public listing used by index.html and blog.html
async function handleBlogPosts(url, env) {
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 100));
  try {
    const posts = await getBlogPosts(env, { limit });
    return new Response(viaCdn(JSON.stringify(posts)), {
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    console.error('blog-posts:', e.message);
    return new Response(JSON.stringify({ error: 'Failed to load posts', detail: e.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function html(body, status) {
  return new Response(viaCdn(body), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// The database didn't answer. 503 + Retry-After tells Google the page is only
// briefly down and to come back, so a short outage doesn't cost it its place.
function tryLater(body) {
  const res = html(body, 503);
  res.headers.set('Retry-After', '300');
  return res;
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

function injectAlsoRead(content) {
  const linkRe = /<a\s[^>]*href="(\/posts\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const links = [];
  let m;
  while ((m = linkRe.exec(content)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text) links.push({ href: m[1], text });
  }
  if (!links.length) return content;

  const slots = [2, 4, 6];
  const boxes = links.slice(0, slots.length);
  const parts = content.split('</p>');
  let pCount = 0, boxIdx = 0;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    out.push(parts[i]);
    if (i < parts.length - 1) {
      out.push('</p>');
      pCount++;
      if (slots.indexOf(pCount) !== -1 && boxIdx < boxes.length) {
        const b = boxes[boxIdx++];
        out.push(`<div class="also-read"><strong>Also Read:</strong> <a href="${b.href}">${b.text}</a></div>`);
      }
    }
  }
  return out.join('');
}

async function getShopProducts(env) {
  if (!env.SUPABASE_URL) return [];
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/shop_products?active=eq.true&select=id,name,slug,category,pet_type,image_url,price,emoji&limit=500`,
    { headers: sbPublicHeaders(env) }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

// Shop category a post is about, judged from its title, keyword and category
const POST_TOPICS = [
  ['Health',      /\b(health|vet|vets|worms?|deworm\w*|ticks?|fleas?|vaccin\w*|disease|sick|ill|vomit\w*|diarrh\w*|poison\w*|toxic|vitamins?|supplements?|medic\w*|infection|parvo|symptoms?|emergency|pain|fever|allerg\w*|skin|itch\w*)\b/],
  ['Food',        /\b(food|foods|feed|feeding|diet|eat|eating|nutrition|treats?|milk|meals?|kibble|calories)\b/],
  ['Grooming',    /\b(groom\w*|bath\w*|shampoo|brush\w*|nails?|fur|coat|shedding|teeth|dental|hygiene)\b/],
  ['Toy',         /\b(toys?|play\w*|chew\w*|bored\w*|enrichment)\b/],
  ['Accessories', /\b(train\w*|leash\w*|collars?|walk\w*|harness\w*)\b/],
  ['Housing',     /\b(beds?|kennels?|cages?|crates?|house|housing|sleep\w*)\b/],
  ['Travel',      /\b(travel\w*|carriers?|trip)\b/],
  ['Clothing',    /\b(cloth\w*|sweaters?|jackets?|raincoats?)\b/],
];
const STOP_WORDS = new Set('a an and are as at be best can do dog dogs cat cats for from how in is it my nigeria of on or puppy puppies kitten kittens safe the to what when which why with your you'.split(' '));

function postPet(text) {
  const dog = /\b(dogs?|pupp(y|ies)|canine)\b/.test(text);
  const cat = /\b(cats?|kittens?|feline)\b/.test(text);
  return dog === cat ? '' : (dog ? 'Dog' : 'Cat');
}

// Pick up to 3 shop products that suit a blog post, plus the shop section to browse
function matchProducts(post, products) {
  const text = [post.title, post.focus_keyword, blogCategory(post).name].filter(Boolean).join(' ').toLowerCase();
  const pet = postPet(text);
  const topic = (POST_TOPICS.find(([, re]) => re.test(text)) || [])[0] || '';
  const words = new Set(text.split(/[^a-z0-9]+/).filter(t => t.length > 2 && !STOP_WORDS.has(t)));
  const scored = products.map(p => {
    const petType = String(p.pet_type || '');
    if (pet && petType && petType !== 'All' && petType !== pet) return { p, score: 0 };
    // Shared words between the post and product name ("deworming" ~ "dewormer")
    let shared = 0;
    for (const t of String(p.name || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length < 3 || STOP_WORDS.has(t)) continue;
      if (words.has(t) || (t.length >= 5 && [...words].some(w => w.length >= 5 && w.slice(0, 5) === t.slice(0, 5)))) shared++;
    }
    // Health products only make sense when they name what the post is about
    if (topic === 'Health' && !shared) return { p, score: 0 };
    let score = shared * 2;
    if (topic && p.category === topic) score += 3;
    if (pet && petType === pet) score += 1;
    return { p, score };
  }).filter(s => s.score >= 3).sort((a, b) => b.score - a.score);
  const params = new URLSearchParams();
  if (topic) params.set('cat', topic);
  if (pet) params.set('pet', pet);
  return {
    items: scored.slice(0, 3).map(s => s.p),
    shopUrl: '/shop.html' + (params.toString() ? '?' + params : ''),
    label: [pet, topic === 'Toy' ? 'Toys' : topic].filter(Boolean).join(' ') || 'Pet',
  };
}

function productImage(p) {
  const v = String(p.image_url || '');
  if (v.startsWith('[')) { try { return JSON.parse(v)[0] || ''; } catch { return ''; } }
  return v;
}

function renderPost(post, related, shop = { items: [], shopUrl: '/shop.html', label: 'Pet' }) {
  const cat = blogCategory(post);
  const date = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const relCards = related.map(r => `
    <a class="rel-card" href="${esc(postPath(r))}">
      ${r.featured_image
        ? `<img class="rel-thumb" src="${esc(r.featured_image)}" alt="${esc(r.title)}" loading="lazy"/>`
        : `<div class="rel-thumb-placeholder">🐾</div>`}
      <div class="rel-body">
        <div class="rel-cat" style="color:${blogCategory(r).color}">${esc(blogCategory(r).name)}</div>
        <div class="rel-title">${esc(r.title)}</div>
      </div>
    </a>`).join('');

  const shopCards = shop.items.map(p => {
    const img = productImage(p);
    return `
    <a class="shop-card" href="${esc(productPath(p))}">
      ${img ? `<img class="shop-thumb" src="${esc(img)}" alt="${esc(p.name)}" loading="lazy"/>` : `<div class="shop-thumb shop-thumb-ph">${esc(p.emoji || '🐾')}</div>`}
      <div class="shop-name">${esc(p.name)}</div>
      ${p.price ? `<div class="shop-price">₦${Number(p.price).toLocaleString('en-NG')}</div>` : ''}
    </a>`;
  }).join('');
  const shopHtml = `<div class="shop-box">
    <div class="shop-head"><div class="rel-label">Shop ${esc(shop.label)} Products</div><a class="shop-all" href="${esc(shop.shopUrl)}">Browse all →</a></div>
    ${shopCards ? `<div class="shop-grid">${shopCards}</div>` : ''}
  </div>`;

  const heroHtml = post.featured_image
    ? `<div class="art-hero art-hero-img">
        <img class="art-hero-bg" src="${esc(post.featured_image)}" alt="${esc(post.title)}" fetchpriority="high"/>
        <div class="art-hero-overlay"></div>
        <div class="art-hero-content">
          <a class="art-cat" href="${blogCatPath(cat)}" style="background:${cat.color}">${cat.emoji} ${esc(cat.name)}</a>
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
        <a class="art-cat" href="${blogCatPath(cat)}" style="background:${cat.color}">${cat.emoji} ${esc(cat.name)}</a>
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
  const postUrl   = escUrl(`https://puppyplace.ng${postPath(post)}`);
  const jsonLd    = JSON.stringify({
    '@context':    'https://schema.org',
    '@type':       'BlogPosting',
    headline:      post.title      || '',
    description:   plainText(post.excerpt) || plainText(post.content, 200),
    image:         post.featured_image || '',
    articleSection: cat.name,
    author:    { '@type': 'Organization', name: 'PuppyPlace.ng' },
    publisher: { '@type': 'Organization', name: 'PuppyPlace.ng', url: 'https://puppyplace.ng' },
    datePublished: post.published_at || '',
    dateModified:  post.updated_at || post.published_at || '',
    mainEntityOfPage: `https://puppyplace.ng${postPath(post)}`,
    url:           `https://puppyplace.ng${postPath(post)}`,
  }).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="google-adsense-account" content="ca-pub-4218810555810518">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4218810555810518" crossorigin="anonymous"></script>
<title>${esc(pageTitle)}</title>
<meta name="description" content="${esc(metaDesc)}"/>
${post.focus_keyword ? `<meta name="keywords" content="${esc(post.focus_keyword)}"/>` : ''}
<meta property="og:type" content="article"/>
<meta property="og:site_name" content="PuppyPlace"/>
<meta property="og:title" content="${esc(post.meta_title || post.title)}"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<link rel="canonical" href="${postUrl}"/>
<meta property="og:url" content="${postUrl}"/>
${imgUrl ? `<meta property="og:image" content="${imgUrl}"/>
<meta property="og:image:secure_url" content="${imgUrl}"/>
<meta property="og:image:alt" content="${esc(post.title)}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(post.meta_title || post.title)}"/>
<meta name="twitter:description" content="${esc(metaDesc)}"/>
${imgUrl ? `<meta name="twitter:image" content="${imgUrl}"/>` : ''}
<script type="application/ld+json">${jsonLd}</script>
<script type="application/ld+json">${breadcrumbLd([
  { name: 'Home', url: 'https://puppyplace.ng/' },
  { name: 'Blog', url: 'https://puppyplace.ng/blog.html' },
  { name: cat.name, url: `https://puppyplace.ng${blogCatPath(cat)}` },
  { name: post.title || '', url: `https://puppyplace.ng${postPath(post)}` },
])}</script>
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
.crumbs{max-width:760px;margin:0 auto;padding:18px 24px 0;font-size:13px;font-weight:700;color:var(--gray)}.crumbs a{color:var(--gray)}.crumbs a:hover{color:var(--orange)}
a.art-cat{display:inline-block}
.art-hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.shop-box{padding:8px 24px 40px}.shop-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.shop-all{color:var(--orange);font-weight:800;font-size:15px}
.shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}
.shop-card{background:#fff;border:1.5px solid var(--border);border-radius:var(--r);overflow:hidden;display:block;transition:all var(--trans)}.shop-card:hover{border-color:var(--orange);transform:translateY(-3px);box-shadow:var(--shadow)}
.shop-thumb{width:100%;height:150px;object-fit:cover;display:block;background:#fff}.shop-thumb-ph{display:flex;align-items:center;justify-content:center;font-size:48px;background:linear-gradient(135deg,#fdeee7,#fbd4c3)}
.shop-name{font-size:14px;font-weight:800;line-height:1.4;color:var(--black);padding:12px 14px 4px}.shop-price{font-size:14px;font-weight:900;color:var(--orange);padding:0 14px 14px}
.art-hero-overlay{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.25) 0%,rgba(0,0,0,.72) 100%);pointer-events:none}
.art-hero-content{position:relative;z-index:1;width:100%;padding:72px 40px 60px;text-align:center}
.art-cat{display:inline-block;color:#fff;font-size:11px;font-weight:800;padding:6px 18px;border-radius:50px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:20px}
.art-title{font-size:clamp(24px,5vw,44px);font-weight:900;color:#fff;line-height:1.25;max-width:760px;margin:0 auto 20px}
.art-meta{font-size:14px;color:rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
/* Content */
.art-wrap{max-width:780px;margin:0 auto;width:100%;flex:1}
.art-body{padding:56px 24px 0}
.art-body h2{font-size:26px;font-weight:900;margin:40px 0 14px;color:var(--black);line-height:1.3}
.art-body h3{font-size:22px;font-weight:900;margin:34px 0 12px;color:var(--black);line-height:1.35}
.art-body h4{font-size:21px;font-weight:900;margin:36px 0 12px;color:var(--black)}
.art-body img{max-width:100%;height:auto;border-radius:var(--r);margin:8px 0 20px;display:block}
.art-body blockquote{border-left:4px solid var(--orange);background:#fff;padding:14px 20px;margin:0 0 20px;font-style:italic;color:#555}
.art-body table{width:100%;border-collapse:collapse;margin:0 0 20px;font-size:15px;display:block;overflow-x:auto}
.art-body th,.art-body td{border:1px solid var(--border);padding:10px 12px;text-align:left}
.art-body th{background:var(--light);font-weight:800}
.art-body p{margin:0 0 20px;font-size:17px;color:#444;line-height:1.85}
.art-body ul,.art-body ol{margin:0 0 20px;padding-left:26px}
.art-body li{margin-bottom:10px;font-size:17px;color:#444;line-height:1.75}
.art-body strong{font-weight:800;color:var(--black)}
.art-body em{font-style:italic}
.art-body a{color:#FF6B00;font-weight:600;text-decoration:underline}.art-body a:hover{color:#e05a00;text-decoration:none}
.also-read{background:#FFF3E8;border-left:4px solid #FF6B00;padding:12px 16px;margin:0 0 20px;font-size:14px}.also-read strong{color:#FF6B00}.art-body .also-read a{color:#1a1a18;font-weight:800;text-decoration:none;text-transform:uppercase}.art-body .also-read a:hover{color:#FF6B00;text-decoration:underline}
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
<nav class="crumbs" aria-label="Breadcrumb"><a href="/index.html">Home</a> › <a href="/blog.html">Blog</a> › <a href="${blogCatPath(cat)}">${esc(cat.name)}</a></nav>
<div class="art-wrap">
  <div class="art-body">${injectAlsoRead(post.content || '')}</div>
  ${shopHtml}
  ${related.length ? `<div class="art-divider"></div><div class="related"><div class="rel-label">More from the Blog</div><div class="rel-grid">${relCards}</div></div>` : '<div style="padding-bottom:80px"></div>'}
</div>
<footer class="footer">
  &copy; 2026 <a href="/index.html">PuppyPlace.ng</a> &mdash; Your trusted pet store in Nigeria<br/><a href="/about.html">About</a> · <a href="/contact.html">Contact</a> · <a href="/faq.html">FAQs</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a>
</footer>
<script>(function(){var s=Date.now(),p=location.pathname;try{if(localStorage.getItem('pp_notrack'))return;}catch(e){}var v=JSON.stringify({path:p,ref:document.referrer});if(navigator.sendBeacon)navigator.sendBeacon('/api/track-view',v);else fetch('/api/track-view',{method:'POST',body:v,keepalive:true}).catch(function(){});function send(){var t=Math.round((Date.now()-s)/1000);if(t<2||!navigator.sendBeacon)return;navigator.sendBeacon('/api/track-time',JSON.stringify({path:p,secs:t}));}document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send();});window.addEventListener('pagehide',send);})();</script>
</body>
</html>`;
}

function notFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><title>Post Not Found — PuppyPlace</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet"/>
<style>body{font-family:'Nunito',sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{font-size:32px;font-weight:900;margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{display:inline-block;background:#ed6436;color:#fff;border-radius:50px;padding:14px 32px;font-weight:800}</style>
</head><body><div style="font-size:72px;margin-bottom:20px">🐾</div><h1>Post Not Found</h1><p>This article doesn't exist or may have been removed.</p><a href="/blog.html">Browse All Posts</a></body></html>`;
}

function errorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><title>Error — PuppyPlace</title>
<style>body{font-family:sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{color:#ed6436;font-weight:700}</style>
</head><body><h1>⚠️ ${esc(msg)}</h1><p>Please try again later.</p><a href="/blog.html">← All Posts</a></body></html>`;
}

// slug (+ updated_at when the table has it) for every row matching filter
async function sitemapRows(env, table, filter) {
  for (const fields of ['slug,updated_at', 'slug']) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}&select=${fields}`, { headers: sbHeaders(env) });
      if (!res.ok) { console.error(`sitemap ${table} (${fields}): ${res.status} ${(await res.text()).slice(0, 200)}`); continue; }
      const rows = await res.json();
      if (Array.isArray(rows)) return rows;
    } catch (e) {
      console.error(`sitemap ${table}:`, e.message);
    }
  }
  return [];
}

async function serveSitemap(env) {
  if (!env.SUPABASE_URL) {
    return new Response('Server not configured', { status: 503 });
  }

  // No lastmod on these: there's no real date to give, and stamping every page
  // with today's date daily teaches Google to ignore the dates that are real
  // (pets, posts, products), which it uses to pick what to crawl next
  const staticPages = [
    'https://puppyplace.ng/',
    'https://puppyplace.ng/shop.html',
    'https://puppyplace.ng/about.html',
    'https://puppyplace.ng/contact.html',
    'https://puppyplace.ng/blog.html',
    'https://puppyplace.ng/pets.html',
    'https://puppyplace.ng/privacy.html',
    'https://puppyplace.ng/terms.html',
    'https://puppyplace.ng/faq.html',
    'https://puppyplace.ng/shipping.html',
    'https://puppyplace.ng/returns.html',
    'https://puppyplace.ng/track-order.html',
    'https://puppyplace.ng/sell.html',
    'https://puppyplace.ng/sell-my-dog.html',
    'https://puppyplace.ng/careers.html',
  ];

  // Each source is fetched on its own and a failure only drops that source,
  // so one bad query never takes the whole sitemap down
  const [posts, products, petRows, livePets] = await Promise.all([
    getAllPosts(env).catch(e => { console.error('sitemap posts:', e.message); return []; }),
    sitemapRows(env, 'shop_products', 'active=eq.true'),
    sitemapRows(env, 'pets', 'active=eq.true&order=created_at.desc'),
    getLivePets(env).catch(e => { console.error('sitemap pet pages:', e.message); return []; }),
  ]);
  const pets = petRows.filter(p => p.slug).map(p => ({ loc: `https://puppyplace.ng/pets/${encodeURIComponent(p.slug)}`, lastmod: p.updated_at ? p.updated_at.slice(0, 10) : '' }));

  const toUrl = (loc, lastmod) =>
    `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;

  const staticUrls = staticPages.map(loc => toUrl(loc));
  const usedCats = new Set(posts.map(p => blogCategory(p).slug));
  const catUrls = BLOG_CATS.filter(c => usedCats.has(c.slug)).map(c => toUrl(`https://puppyplace.ng${blogCatPath(c)}`));
  const postUrls = posts.map(p => toUrl(`https://puppyplace.ng${postPath(p)}`, p.published_at ? p.published_at.slice(0, 10) : ''));
  const productUrls = products.filter(p => p.slug).map(p => toUrl(`https://puppyplace.ng/product/${encodeURIComponent(p.slug)}.html`, p.updated_at ? p.updated_at.slice(0, 10) : ''));
  const petUrls = pets.map(p => toUrl(p.loc, p.lastmod));
  const petPageUrls = petsSitemapPaths(livePets).map(path => toUrl(`https://puppyplace.ng${path}`));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...catUrls, ...postUrls, ...productUrls, ...petPageUrls, ...petUrls].join('\n')}\n</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

/* ── PAGE VIEW STATS ── */

async function handleStats(request, url, env) {
  if (!env.SUPABASE_URL) return jsonResp({ error: 'Server not configured' }, 503);

  const token = url.searchParams.get('token');
  if (!await verifyToken(token, env)) return jsonResp({ error: 'Unauthorized' }, 401);

  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResp({ error: 'Invalid date' }, 400);

  const next = new Date(date + 'T00:00:00.000Z');
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/page_views?viewed_at=gte.${date}T00:00:00.000Z&viewed_at=lt.${nextDate}T00:00:00.000Z&select=path,country,viewed_at,visitor_hash,referrer,duration_seconds&limit=5000&order=viewed_at.asc`,
      { headers: sbHeaders(env) }
    );
    if (!res.ok) return jsonResp({ error: 'Failed to fetch stats' }, 500);
    const rows = await res.json();
    if (!Array.isArray(rows)) return jsonResp({ error: 'Unexpected response' }, 500);

    const pageMap = {};
    const countryMap = {};
    const referrerMap = {};
    const hours = new Array(24).fill(0);
    const allVisitors = new Set();

    for (const row of rows) {
      if (!pageMap[row.path]) pageMap[row.path] = { views: 0, visitors: new Set(), totalSecs: 0, timedViews: 0 };
      pageMap[row.path].views++;
      if (row.duration_seconds > 0) { pageMap[row.path].totalSecs += row.duration_seconds; pageMap[row.path].timedViews++; }
      const c = row.country || '--';
      if (!countryMap[c]) countryMap[c] = { views: 0, visitors: new Set() };
      countryMap[c].views++;
      const ref = row.referrer || 'direct';
      if (!referrerMap[ref]) referrerMap[ref] = { views: 0, visitors: new Set() };
      referrerMap[ref].views++;
      if (row.visitor_hash) {
        pageMap[row.path].visitors.add(row.visitor_hash);
        countryMap[c].visitors.add(row.visitor_hash);
        referrerMap[ref].visitors.add(row.visitor_hash);
        allVisitors.add(row.visitor_hash);
      }
      if (row.viewed_at) hours[new Date(row.viewed_at).getUTCHours()]++;
    }

    const pages = Object.entries(pageMap)
      .map(([path, d]) => ({ path, views: d.views, visitors: d.visitors.size, avgSecs: d.timedViews ? Math.round(d.totalSecs / d.timedViews) : null }))
      .sort((a, b) => b.views - a.views);

    const countries = Object.entries(countryMap)
      .map(([country, d]) => ({ country, views: d.views, visitors: d.visitors.size }))
      .sort((a, b) => b.views - a.views);

    const referrers = Object.entries(referrerMap)
      .map(([source, d]) => ({ source, views: d.views, visitors: d.visitors.size }))
      .sort((a, b) => b.views - a.views);

    return jsonResp({ date, total: rows.length, visitors: allVisitors.size, pages, countries, hours, referrers });
  } catch {
    return jsonResp({ error: 'Failed to generate stats' }, 500);
  }
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
    // (a failure here is the database, not a missing product: never answer it with a 404)
    const slugRes = await fetch(`${base}/rest/v1/shop_products?slug=eq.${encodeURIComponent(slugOrId)}&active=eq.true&select=*`, { headers: h });
    if (!slugRes.ok) throw new Error(`Supabase ${slugRes.status}`);
    const slugRows = await slugRes.json();
    if (slugRows && slugRows.length) product = slugRows[0];

    // 2. Try direct ID lookup
    if (!product) {
      const idRes = await fetch(`${base}/rest/v1/shop_products?id=eq.${encodeURIComponent(slugOrId)}&active=eq.true&select=*`, { headers: h });
      if (idRes.ok) {
        const rows = await idRes.json();
        if (rows && rows.length) product = rows[0];
      }
    }

    // 3. If slug--uuid format (transition from old URLs), extract uuid and redirect to canonical URL
    if (!product) {
      const sep = slugOrId.lastIndexOf('--');
      if (sep >= 0) {
        const extractedId = slugOrId.slice(sep + 2);
        const idRes = await fetch(`${base}/rest/v1/shop_products?id=eq.${encodeURIComponent(extractedId)}&active=eq.true&select=slug`, { headers: h });
        if (idRes.ok) {
          const rows = await idRes.json();
          if (rows && rows.length && rows[0].slug) {
            return Response.redirect(`https://puppyplace.ng/product/${encodeURIComponent(rows[0].slug)}.html`, 301);
          }
        }
      }
    }
  } catch (e) {
    console.error('product ' + slugOrId + ':', e.message);
    return tryLater(productErrorPage('Failed to load product.'));
  }

  if (!product) {
    const live = await getShopProducts(env).catch(() => []);
    const match = closestSlug(slugOrId, live.map(p => p.slug).filter(Boolean));
    if (match) return Response.redirect(`https://puppyplace.ng${productPath({ slug: match })}`, 301);
    return html(productNotFoundPage(), 404);
  }
  if (product.slug && slugOrId !== product.slug) {
    return Response.redirect(`https://puppyplace.ng${productPath(product)}`, 301);
  }

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
  const mainImage = productImage(p);
  const imgUrl   = mainImage ? escUrl(`https://puppyplace.ng/api/og-img?url=${encodeURIComponent(mainImage)}`) : '';
  const pageUrl  = `https://puppyplace.ng${productPath(p)}`;
  const metaDesc = plainText(desc, 160) || `${name} — available at PuppyPlace.ng`;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: plainText(desc, 300),
    image: mainImage,
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
<meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="google-adsense-account" content="ca-pub-4218810555810518">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4218810555810518" crossorigin="anonymous"></script>
<title>${esc(name)} — PuppyPlace.ng</title>
<meta name="description" content="${esc(metaDesc)}"/>
<meta property="og:type" content="product"/>
<meta property="og:site_name" content="PuppyPlace"/>
<meta property="og:title" content="${esc(name)} — PuppyPlace.ng"/>
<meta property="og:description" content="${esc(metaDesc)}"/>
<link rel="canonical" href="${escUrl(pageUrl)}"/>
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
a.nav-ico{text-decoration:none}
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
.pi-actions{display:flex;gap:10px;margin-bottom:12px}
.btn-wa-page{flex:1;background:#25D366;color:#fff;border:none;border-radius:10px;height:50px;padding:0 12px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .2s;text-decoration:none}
.btn-wa-page:hover{background:#1ebe5d}
.btn-cart{flex:1;background:var(--orange);color:#fff;border:none;border-radius:10px;height:50px;padding:0 12px;font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;transition:background .2s}
.btn-cart:hover{background:#c9530a}
.pi-social-row{display:flex;gap:10px;margin-bottom:16px}
.pi-soc-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:42px;border:1.5px solid var(--border);border-radius:10px;background:var(--white);font-family:'Nunito',sans-serif;font-size:13px;font-weight:800;cursor:pointer;color:var(--black);transition:all .2s}
.pi-soc-btn:hover{border-color:var(--orange);color:var(--orange)}
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
.pv-group-err{outline:2px solid #e74c3c;border-radius:8px;padding:6px;animation:pvShake .35s}
@keyframes pvShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
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
.mob-atc-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff;border-top:1.5px solid #e9ecef;padding:10px 14px;align-items:center;gap:10px;box-shadow:0 -4px 24px rgba(0,0,0,.14)}
.mob-atc-bar a,.mob-atc-bar button{font-size:13px}
@media(max-width:768px){
  .nav{padding:0 12px;height:56px}
  .nav-back{padding:7px 12px;font-size:12px;white-space:nowrap}
  .nav-ico{padding:7px 11px;font-size:13px}
  .page{padding:24px 16px}
  .product-grid{grid-template-columns:1fr;gap:20px}
  .img-box{max-height:320px}
  .pi-meta{grid-template-columns:1fr}
  footer{padding:32px 20px 20px}
  .co-field-row{grid-template-columns:1fr}
  .mob-search-bar{display:block}
  body{padding-bottom:74px}
}
@media(max-width:420px){.nav-icons{gap:5px}.nav-ico{padding:7px 9px}.nav-back{padding:7px 10px}.nav-logo{font-size:18px}}
</style>
</head>
<body>
<nav class="nav">
  <a href="/index.html" class="nav-logo">Puppy<span>Place</span></a>
  <div class="nav-icons">
    <a href="/shop.html" class="nav-back" style="margin-right:4px">← Shop</a>
    <div class="nav-ico" onclick="openWishlist()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle;display:block"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span class="nav-badge" id="wBadge">0</span></div>
    <a class="nav-ico" href="/messages.html" data-pp-inbox aria-label="Messages"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="nav-badge" data-pp-inbox-count style="display:none">0</span></a>
    <div class="nav-ico" onclick="openCart()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle;display:block"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><span class="nav-badge" id="cBadge">0</span></div>
    <a href="/account.html" class="nav-ico"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" style="vertical-align:middle;display:block"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></a>
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
${p.review_count > 0 ? `
        <span class="pi-stars">${'★'.repeat(Math.min(5, Math.round(p.rating || 0)))}${'☆'.repeat(5 - Math.min(5, Math.round(p.rating || 0)))}</span>
        <span>${esc(String(p.rating || 0))} · ${esc(String(p.review_count))} reviews</span>` : `
        <span>No reviews yet</span>`}
      </div>
      ${renderVarGroups(p) ? `<div style="margin-bottom:20px">${renderVarGroups(p)}</div>` : ''}
      ${desc ? `<div class="pi-desc">${desc}</div>` : ''}
      <div class="pi-meta">
        ${p.category ? `<div class="pi-meta-item"><div class="pi-meta-label">Category</div><div class="pi-meta-val">${esc(p.category)}</div></div>` : ''}
        ${p.pet_type  ? `<div class="pi-meta-item"><div class="pi-meta-label">For</div><div class="pi-meta-val">${esc(p.pet_type)}</div></div>` : ''}
        ${p.brand     ? `<div class="pi-meta-item"><div class="pi-meta-label">Brand</div><div class="pi-meta-val">${esc(p.brand)}</div></div>` : ''}
        <div class="pi-meta-item"><div class="pi-meta-label">Stock</div><div class="pi-meta-val" style="color:#2ecc71">✅ In Stock</div></div>
      </div>
      <div class="pi-actions" id="piActions">
        <a href="https://wa.me/2348156740438?text=${encodeURIComponent('Hi! I\'m interested in ' + name + ' (' + price + ')')}" target="_blank" rel="noopener" class="btn-wa-page"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Order on WhatsApp</a>
        <button class="btn-cart" onclick="addToCartBtn()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Cart</button>
      </div>
      <div class="pi-social-row">
        <button class="pi-soc-btn" onclick="addToWishBtn()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Wishlist</button>
        <button class="pi-soc-btn" onclick="shareProduct()"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>
      </div>
      <div style="font-size:12px;color:var(--gray);margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;">
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

<!-- MOBILE STICKY ADD TO CART BAR (shown/hidden by IntersectionObserver) -->
<div class="mob-atc-bar" id="mobAtcBar">
  <a href="https://wa.me/2348156740438?text=${encodeURIComponent('Hi! I\'m interested in ' + name + ' (' + price + ')')}" target="_blank" rel="noopener"
     style="width:46px;height:46px;background:#25D366;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;text-decoration:none;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="24" height="24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>
  <button onclick="addToCartBtn()" style="flex:1;height:46px;background:#ed6436;color:#fff;border:none;border-radius:10px;font-family:'Nunito',sans-serif;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Cart</button>
</div>

<footer>
  <div class="footer-logo">Puppy<span>Place</span>.ng</div>
  <div class="footer-links">
    <a href="/index.html">Home</a>
    <a href="/shop.html">Shop</a>
    <a href="/about.html">About</a>
    <a href="/contact.html">Contact</a>
    <a href="/faq.html">FAQs</a>
    <a href="/shipping.html">Shipping</a>
    <a href="/returns.html">Returns</a>
    <a href="/terms.html">Terms</a>
    <a href="/privacy.html">Privacy</a>
  </div>
  <div class="footer-copy">&copy; 2026 PuppyPlace.ng &#x2014; All rights reserved.</div>
</footer>

<script>window.__pp_prod=${JSON.stringify({id:String(p.id||''),n:name,e:p.emoji||'📦',cat:p.category||'',p:Number(p.price)||0,img:p.image_url||null}).replace(/<\//g,'<\\/')};</script>
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
function ppEvent(e,id,name,price){try{if(localStorage.getItem('pp_notrack'))return;var v=JSON.stringify({event:e,id:id,name:name,price:price,path:location.pathname});if(navigator.sendBeacon)navigator.sendBeacon('/api/track-event',v);else fetch('/api/track-event',{method:'POST',body:v,keepalive:true}).catch(function(){});}catch(x){}}
function showToast(msg){var t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove();},2500);}
function addToCartBtn(){
  var prod=window.__pp_prod||{};
  var id=prod.id;if(!id)return;
  var groups=document.querySelectorAll('.pv-group');
  var varParts=[],storedGroups=[],missing=false;
  groups.forEach(function(grp){
    var labelEl=grp.querySelector('.pv-label');
    var label=labelEl?labelEl.textContent.trim():'Option';
    var sel=grp.querySelector('.pv-opt.selected');
    if(!sel){grp.classList.add('pv-group-err');setTimeout(function(){grp.classList.remove('pv-group-err');},800);missing=true;}
    else{varParts.push(label+': '+sel.textContent.trim());storedGroups.push({label:label,values:Array.from(grp.querySelectorAll('.pv-opt')).map(function(b){return b.textContent.trim();}),selected:sel.textContent.trim()});}
  });
  if(missing){showToast('Please select all options first');return;}
  var variantStr=varParts.join(', ');
  var cid=variantStr?id+'||'+variantStr:id;
  var ex=cartItems.find(function(i){return (i.cid||i.id)===cid;});
  if(ex)ex.qty++;else cartItems.push({cid:cid,id:id,n:prod.n,e:prod.e,img:prod.img||null,cat:prod.cat,p:prod.p||0,qty:1,variant:variantStr,varGroups:storedGroups});
  ppEvent('cart_add',id,prod.n,prod.p||0);
  try{saveCart();}catch(e){}
  try{updateBadges();}catch(e){}
  try{renderCartDrawer();}catch(e){console.error('[PuppyPlace] renderCartDrawer error:',e);}
  openCart();
}
function removeFromCart(cid){
  cartItems=cartItems.filter(function(i){return (i.cid||i.id)!==cid;});
  saveCart();updateBadges();renderCartDrawer();
}
function changeQty(cid,delta){
  var item=cartItems.find(function(i){return (i.cid||i.id)===cid;});
  if(!item)return;
  item.qty+=delta;
  if(item.qty<=0){removeFromCart(cid);return;}
  saveCart();updateBadges();renderCartDrawer();
}
function changeCartVariant(cid,groupLabel,newValue){
  var item=cartItems.find(function(i){return (i.cid||i.id)===cid;});
  if(!item||!item.varGroups)return;
  var group=item.varGroups.find(function(g){return g.label===groupLabel;});
  if(!group)return;
  group.selected=newValue;
  var newVariant=item.varGroups.map(function(g){return g.label+': '+g.selected;}).join(', ');
  var newCid=newVariant?item.id+'||'+newVariant:item.id;
  var existing=cartItems.find(function(i){return (i.cid||i.id)===newCid&&(i.cid||i.id)!==cid;});
  if(existing){existing.qty+=item.qty;cartItems=cartItems.filter(function(i){return (i.cid||i.id)!==cid;});}
  else{item.cid=newCid;item.variant=newVariant;}
  saveCart();updateBadges();renderCartDrawer();
}
function renderCartDrawer(){
  var itemsEl=document.getElementById('cartItems'),emptyEl=document.getElementById('cartEmpty'),footerEl=document.getElementById('cartFooter'),totalEl=document.getElementById('cartTotal');
  if(!cartItems.length){emptyEl.style.display='';itemsEl.innerHTML='';footerEl.style.display='none';return;}
  emptyEl.style.display='none';footerEl.style.display='block';
  itemsEl.innerHTML=cartItems.map(function(item){
    var itemCid=escH(item.cid||item.id);
    var varHtml='';
    if(item.varGroups&&item.varGroups.length){
      varHtml='<div style="margin:6px 0;">';
      item.varGroups.forEach(function(g){
        varHtml+='<div style="margin-bottom:6px;"><div style="font-size:10px;color:#868686;font-weight:700;text-transform:uppercase;margin-bottom:4px;">'+escH(g.label)+'</div><div style="display:flex;flex-wrap:wrap;gap:4px;">';
        g.values.forEach(function(v){
          var isSel=v===g.selected;
          varHtml+='<button style="border:'+(isSel?'1.5px solid #ed6436':'1px solid #e9ecef')+';border-radius:50px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;background:'+(isSel?'#ed6436':'#fff')+';color:'+(isSel?'#fff':'#333')+';font-family:Nunito,sans-serif;" onclick="changeCartVariant(&#39;'+itemCid+'&#39;,&#39;'+escH(g.label)+'&#39;,&#39;'+escH(v)+'&#39;)">'+escH(v)+'</button>';
        });
        varHtml+='</div></div>';
      });
      varHtml+='</div>';
    }
    var cThumb=item.img||'';
    var cThumbHtml=cThumb?'<img src="'+escH(cThumb)+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\\'none\\'">':'<span style="font-size:28px">'+escH(item.e||'📦')+'</span>';
    return '<div style="display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #e9ecef;position:relative;">'
      +'<div style="width:56px;height:56px;background:#f1f3f5;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0;">'+cThumbHtml+'</div>'
      +'<div style="flex:1;min-width:0;">'
        +'<div style="font-size:10px;color:#868686;font-weight:700;text-transform:uppercase;margin-bottom:2px;">'+escH(item.cat)+'</div>'
        +'<div style="font-size:14px;font-weight:800;margin-bottom:5px;">'+escH(item.n)+'</div>'
        +varHtml
        +'<div style="font-size:15px;font-weight:900;color:#ed6436;">'+fmt(item.p*item.qty)+'</div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">'
          +'<button style="width:28px;height:28px;border-radius:50%;border:1px solid #e9ecef;background:#fff;cursor:pointer;" onclick="changeQty(&#39;'+itemCid+'&#39;,-1)">&minus;</button>'
          +'<span style="font-size:13px;font-weight:800;">'+item.qty+'</span>'
          +'<button style="width:28px;height:28px;border-radius:50%;border:1px solid #e9ecef;background:#fff;cursor:pointer;" onclick="changeQty(&#39;'+itemCid+'&#39;,1)">+</button>'
        +'</div>'
      +'</div>'
      +'<button style="position:absolute;top:14px;right:0;background:none;border:none;color:#ccc;font-size:16px;cursor:pointer;" onclick="removeFromCart(&#39;'+itemCid+'&#39;)">&times;</button>'
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
  wishItems.push({id:id,n:prod.n,e:prod.e,img:prod.img||null,cat:prod.cat,p:prod.p||0});
  ppEvent('wishlist_add',id,prod.n,prod.p||0);
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
    var wThumb=item.img||'';
    var wThumbHtml=wThumb?'<img src="'+escH(wThumb)+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\\'none\\'">':'<span style="font-size:30px">'+escH(item.e||'📦')+'</span>';
    return '<div style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid #e9ecef;position:relative;">'
      +'<div style="width:64px;height:64px;background:#f1f3f5;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:30px;flex-shrink:0;">'+wThumbHtml+'</div>'
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
  ppEvent('checkout_start',null,null,cartItems.reduce(function(t,i){return t+i.p*i.qty;},0));
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
async function shareProduct(){
  var prod=window.__pp_prod||{};
  var shareData={title:prod.n||'PuppyPlace Product',text:(prod.n||'')+(prod.p?' — ₦'+prod.p.toLocaleString('en-NG'):''),url:window.location.href};
  if(prod.img&&navigator.canShare){
    try{
      var res=await fetch(prod.img);
      var blob=await res.blob();
      var file=new File([blob],'product.jpg',{type:blob.type||'image/jpeg'});
      if(navigator.canShare({files:[file]}))shareData.files=[file];
    }catch(e){}
  }
  try{if(navigator.share){await navigator.share(shareData);}else{await navigator.clipboard.writeText(shareData.url);showToast('Link copied!');}}catch(e){}
}
/* Sticky ATC: show when product ATC buttons are scrolled out of view */
try{(function(){
  var bar=document.getElementById('mobAtcBar');
  var anchor=document.getElementById('piActions');
  if(!bar||!anchor)return;
  function checkBar(){
    var rect=anchor.getBoundingClientRect();
    bar.style.display=(rect.bottom<0)?'flex':'none';
  }
  window.addEventListener('scroll',checkBar,{passive:true});
  window.addEventListener('resize',checkBar,{passive:true});
  checkBar();
})();}catch(e){}
try{updateBadges();renderCartDrawer();renderWishDrawer();}catch(e){console.error('[PuppyPlace] Cart init error:',e);}
</script>
<script>(function(){var s=Date.now(),p=location.pathname;try{if(localStorage.getItem('pp_notrack'))return;}catch(e){}var v=JSON.stringify({path:p,ref:document.referrer});if(navigator.sendBeacon)navigator.sendBeacon('/api/track-view',v);else fetch('/api/track-view',{method:'POST',body:v,keepalive:true}).catch(function(){});function send(){var t=Math.round((Date.now()-s)/1000);if(t<2||!navigator.sendBeacon)return;navigator.sendBeacon('/api/track-time',JSON.stringify({path:p,secs:t}));}document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')send();});window.addEventListener('pagehide',send);})();</script>
<script src="/pp-inbox.js" defer></script>
</body>
</html>`;
}

function productNotFoundPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><title>Product Not Found — PuppyPlace</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet"/>
<style>body{font-family:'Nunito',sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{font-size:32px;font-weight:900;margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{display:inline-block;background:#ed6436;color:#fff;border-radius:50px;padding:14px 32px;font-weight:800}</style>
</head><body><div style="font-size:72px;margin-bottom:20px">📦</div><h1>Product Not Found</h1><p>This product may have been removed or is no longer available.</p><a href="/shop.html">Browse All Products</a></body></html>`;
}

function productErrorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><link rel="icon" type="image/png" href="https://fsrkzhknqonpjjkjwqlw.supabase.co/storage/v1/object/public/hero-images/851017C8-BF5F-41F8-96D2-8F191E7D2833.png"/><title>Error — PuppyPlace</title>
<style>body{font-family:sans-serif;text-align:center;padding:100px 24px;background:#f8f9fa}h1{margin-bottom:12px}p{color:#868686;margin-bottom:32px}a{color:#ed6436;font-weight:700}</style>
</head><body><h1>⚠️ ${esc(msg)}</h1><p>Please try again later.</p><a href="/shop.html">← Back to Shop</a></body></html>`;
}
