// Pet listing cards, shared by the pets pages in the browser and by worker.js,
// which draws the same cards into the page so search engines see the listings.

export const MAIN_TYPES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Fish'];

const TYPE_EMOJI = {Dog:'🐕',Cat:'🐈',Bird:'🦜',Rabbit:'🐰',Fish:'🐠','Guinea Pig':'🐹',Reptile:'🦎'};
const TYPE_BG    = {Dog:'linear-gradient(135deg,#fdeee7,#fbd4c3)',Cat:'linear-gradient(135deg,#e8f5e9,#c8e6c9)',Bird:'linear-gradient(135deg,#e3f2fd,#bbdefb)',Rabbit:'linear-gradient(135deg,#f3e5f5,#e1bee7)',Fish:'linear-gradient(135deg,#e0f7fa,#b2ebf2)','Guinea Pig':'linear-gradient(135deg,#fff9c4,#fff59d)',Reptile:'linear-gradient(135deg,#f1f8e9,#dcedc8)'};

const ICO = {
  pin: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  cal: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
  shield: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 2.5 4 5.5v6c0 5 3.4 8.8 8 10 4.6-1.2 8-5 8-10v-6l-8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke-linecap="round"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.8 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.2 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20Z"/></svg>',
  arrow: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

export function esc(s) {
  if (!s && s !== 0) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function fmtNaira(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

// Age is free text ("9 weeks", "5 months", "1.5 years"); turn it into weeks
export function ageWeeks(a) {
  const m = String(a || '').toLowerCase().match(/(\d+(?:\.\d+)?)\s*(w|m|y|d)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return {d: n / 7, w: n, m: n * 4.345, y: n * 52}[m[2]];
}

// The pets table has no gender column yet, so read it from the listing text
export function genderOf(p) {
  const g = String(p.gender || p.sex || '').toLowerCase();
  if (g) return g.startsWith('f') ? 'Female' : g.startsWith('m') ? 'Male' : g.startsWith('p') ? 'Pair' : '';
  const t = `${p.name || ''} ${p.specs || ''}`.toLowerCase();
  if (/\b(pair|male and female|male & female|males and females)\b/.test(t)) return 'Pair';
  if (/\bfemale\b/.test(t)) return 'Female';
  if (/\bmale\b/.test(t)) return 'Male';
  return '';
}

export function renderPetCard(p, saved = false, eager = false) {
  const isAdopt = p.listing_type === 'adoption';
  const img = p.image_url || (p.image_urls && p.image_urls[0]);
  const bg = img ? '#f1f2f4' : (TYPE_BG[p.type] || 'linear-gradient(135deg,#fafafa,#f0f0f0)');
  const name = p.breed || p.type;
  const alt = `${name} ${isAdopt ? 'for adoption' : 'for sale'}${p.location ? ' in ' + p.location : ''}`;
  const imgHtml = img
    ? `<img src="${esc(img)}" alt="${esc(alt)}"${eager ? '' : ' loading="lazy"'}/>`
    : `<span>${TYPE_EMOJI[p.type] || '🐾'}</span>`;
  const href = p.slug ? `/pets/${encodeURIComponent(p.slug)}` : '#';
  const g = genderOf(p);
  const gSym = {Male: '♂', Female: '♀', Pair: '⚤'}[g];
  const health = p.vaccinated ? 'Vaccinated' : (p.dewormed ? 'Dewormed' : '');
  const price = isAdopt
    ? '<span class="pt-price free">Free</span>'
    : (p.price ? `<span class="pt-price">${fmtNaira(p.price)}</span>` : '<span class="pt-price ask">Price on request</span>');

  return `<article class="pet-card">
    <a class="pt-img" href="${esc(href)}" style="background:${bg}" tabindex="-1" aria-hidden="true">
      ${imgHtml}
      <span class="pt-badge${isAdopt ? ' adopt' : ''}">${isAdopt ? 'Adoption' : 'For Sale'}</span>
    </a>
    <button class="pt-heart${saved ? ' on' : ''}" data-id="${esc(p.id)}" aria-label="${saved ? 'Remove from saved' : 'Save pet'}" aria-pressed="${saved}">${ICO.heart}</button>
    <div class="pt-body">
      <h3 class="pt-name"><a href="${esc(href)}">${esc(name)}</a></h3>
      <div class="pt-meta">
        ${p.breeder ? `<span><span class="hm">🏠</span>${esc(p.breeder)}</span>` : (p.name ? `<span><span class="hm">🏠</span>${esc(p.name)}</span>` : '')}
        ${p.location ? `<span>${ICO.pin}${esc(p.location)}</span>` : ''}
      </div>
      <div class="pt-specs">
        ${p.age ? `<span>${ICO.cal}${esc(p.age)}</span>` : ''}
        ${g ? `<span><span class="gs">${gSym}</span>${g}</span>` : ''}
        ${health ? `<span class="ok">${ICO.shield}${health}</span>` : ''}
      </div>
      <div class="pt-foot">
        ${price}
        <a class="pt-view" href="${esc(href)}" aria-label="View details: ${esc(alt)}">View Details ${ICO.arrow}</a>
      </div>
    </div>
  </article>`;
}
