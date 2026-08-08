/* ============================================================
   Zakázky — Chundela Reality × František Dron

   Zakázka = fotky + vizualizace + videa + komentáře.
   Aktivní nebo hotové. Obě strany můžou psát, měnit i mazat.

   Data leží v privátním repu na GitHubu, každá změna je commit,
   takže je vidět kdo a kdy, a nic nejde nenávratně ztratit.
   ============================================================ */

const $  = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
const nyni = () => new Date().toISOString();
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);

const dtPlne = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dtKratce = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });

function kdyKratce(iso) {
  const d = new Date(iso);
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${Math.floor(min)} min`;
  if (min < 1440) return `před ${Math.floor(min / 60)} h`;
  if (min < 2880) return 'včera';
  if (min < 10080) return `před ${Math.floor(min / 1440)} dny`;
  return dtKratce.format(d) + '.';
}

const iniciely = (jmeno) => String(jmeno || '?').split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase();

/* ---------------------------------------------------------- Vimeo */

function vimeoInfo(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/vimeo\.com\/(?:video\/|manage\/videos\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{6,})/) || s.match(/^(\d{6,})$/);
  if (!m) return null;
  const id = m[1];
  let hash = null;
  const dotaz = s.match(/[?&]h=([0-9a-zA-Z]+)/);
  if (dotaz) hash = dotaz[1];
  else {
    const cesta = s.match(new RegExp(id + '\\/([0-9a-zA-Z]{4,})'));
    if (cesta) hash = cesta[1];
  }
  const p = new URLSearchParams({ title: '0', byline: '0', portrait: '0', dnt: '1' });
  if (hash) p.set('h', hash);
  return {
    id, hash,
    embed: `https://player.vimeo.com/video/${id}?${p}`,
    verejny: `https://vimeo.com/${id}${hash ? '/' + hash : ''}`,
  };
}

const nahledy = new Map();

async function vimeoNahled(info) {
  if (nahledy.has(info.id)) return nahledy.get(info.id);
  const klic = 'kokpit.thumb.' + info.id;
  const ulozeny = localStorage.getItem(klic);
  if (ulozeny) { nahledy.set(info.id, ulozeny); return ulozeny; }
  const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(info.verejny)}&width=800`);
  if (!r.ok) throw new Error('bez náhledu');
  const { thumbnail_url } = await r.json();
  if (!thumbnail_url) throw new Error('bez náhledu');
  localStorage.setItem(klic, thumbnail_url);
  nahledy.set(info.id, thumbnail_url);
  return thumbnail_url;
}

/* ---------------------------------------------------------- odemčení */

const b64naBajty = (b64) => Uint8Array.from(atob(b64.replace(/\s+/g, '')), (c) => c.charCodeAt(0));

function bajtyNaB64(bajty) {
  let bin = '';
  for (let i = 0; i < bajty.length; i += 0x8000) bin += String.fromCharCode.apply(null, bajty.subarray(i, i + 0x8000));
  return btoa(bin);
}

const textNaB64 = (s) => bajtyNaB64(new TextEncoder().encode(s));
const b64NaText = (b) => new TextDecoder().decode(b64naBajty(b));

async function desifruj(blobB64, heslo) {
  const raw = b64naBajty(blobB64);
  const zaklad = await crypto.subtle.importKey('raw', new TextEncoder().encode(heslo), 'PBKDF2', false, ['deriveKey']);
  const klic = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: raw.slice(0, 16), iterations: CFG.iterace || 600000, hash: 'SHA-256' },
    zaklad, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(16, 28) }, klic, raw.slice(28)));
}

async function odemkni(heslo) {
  for (const [role, blob] of Object.entries(CFG.blobs || {})) {
    if (!blob) continue;
    try {
      const token = await desifruj(blob, heslo);
      if (/^(github_pat_|ghp_|gho_)/.test(token)) return { role, token: token.trim() };
    } catch { /* jiné heslo, zkus další */ }
  }
  return null;
}

/* ---------------------------------------------------------- GitHub */

const SOUBOR_ZAKAZKY = 'data/zakazky.json';
const SOUBOR_KOMENTARE = 'data/aktivita.json';

const GH = {
  token: null,
  etag: {},
  mezipamet: {},

  volej: (cesta, nastaveni = {}) => fetch('https://api.github.com' + cesta, {
    cache: 'no-store',
    ...nastaveni,
    headers: {
      Authorization: 'Bearer ' + GH.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(nastaveni.headers || {}),
    },
  }),

  cesta: (soubor) => `/repos/${CFG.owner}/${CFG.repo}/contents/${soubor}`,

  async chyba(r) {
    if (r.status === 401) return 'GitHub odmítl přístup — klíč vypršel nebo byl zrušen. Ozvi se Frantovi.';
    if (r.status === 403) return 'GitHub přístup zamítl. Klíč nemá právo zapisovat.';
    if (r.status === 404) return 'Datový soubor se nenašel. Zkontroluj nastavení repozitáře.';
    let detail = '';
    try { detail = (await r.json()).message || ''; } catch {}
    return `GitHub vrátil chybu ${r.status}. ${detail}`;
  },

  async nacti(soubor, { podminene = false } = {}) {
    const hlavicky = {};
    if (podminene && GH.etag[soubor]) hlavicky['If-None-Match'] = GH.etag[soubor];
    const r = await GH.volej(`${GH.cesta(soubor)}?ref=${CFG.branch}`, { headers: hlavicky });
    if (r.status === 304) return { zmeneno: false };
    if (!r.ok) throw new Error(await GH.chyba(r));
    const et = r.headers.get('etag');
    if (et) GH.etag[soubor] = et;
    const j = await r.json();
    const data = JSON.parse(b64NaText(j.content));
    GH.mezipamet[soubor] = { data, sha: j.sha };
    return { zmeneno: true, data, sha: j.sha };
  },

  /* Zápis odolný proti souběhu: když někdo uložil mezitím,
     stáhneme jeho verzi a naši změnu na ni pustíme znovu. */
  async zmen(soubor, uprav, zprava) {
    for (let pokus = 0; pokus < 6; pokus++) {
      let ulozene = GH.mezipamet[soubor];
      if (pokus > 0 || !ulozene) {
        const v = await GH.nacti(soubor);
        ulozene = { data: v.data, sha: v.sha };
      }
      const kopie = structuredClone(ulozene.data);
      uprav(kopie);
      kopie.zmeneno = nyni();
      kopie.zmenil = JA.jmeno;

      const telo = { message: zprava, content: textNaB64(JSON.stringify(kopie, null, 2)), branch: CFG.branch, sha: ulozene.sha };
      const r = await GH.volej(GH.cesta(soubor), { method: 'PUT', body: JSON.stringify(telo) });

      if (r.ok) {
        const j = await r.json();
        delete GH.etag[soubor];
        GH.mezipamet[soubor] = { data: kopie, sha: j.content.sha };
        return kopie;
      }
      if (r.status !== 409 && r.status !== 422) throw new Error(await GH.chyba(r));
      await pauza(250 * (pokus + 1));
    }
    throw new Error('Nepovedlo se uložit — někdo jiný právě ukládá to samé. Zkus to za chvíli.');
  },
};

/* ---------------------------------------------------------- stav */

const JA = { role: null, jmeno: null };
const S = { zakazky: [], komentare: [] };
const UI = { filtr: localStorage.getItem('kokpit.filtr') || 'aktivni', hledat: '', otevrena: null, ukladam: 0 };

const videno = JSON.parse(localStorage.getItem('kokpit.videno') || '{}');
const ulozVideno = () => localStorage.setItem('kokpit.videno', JSON.stringify(videno));

const najdi = (id) => S.zakazky.find((z) => z.id === id);
const komentareZ = (id) => S.komentare.filter((k) => k.zakazka === id);

/* Starší tvar dat umí přečíst i tenhle zjednodušený kokpit. */
function normalizuj(z) {
  if (z.stav === 'archiv' || z.stav === 'kos') z.stav = 'hotove';
  if (z.odkazy && !Array.isArray(z.odkazy)) {
    const o = z.odkazy;
    z.fotky = z.fotky || o.fotky || '';
    z.vizualizace = z.vizualizace || o.vizualizace || '';
    z.odkazy = [
      ...(o.inzerat ? [{ nazev: 'Inzerát', url: o.inzerat }] : []),
      ...(o.podklady ? [{ nazev: 'Podklady', url: o.podklady }] : []),
      ...(z.dalsiOdkazy || []),
    ];
    delete z.dalsiOdkazy;
  }
  z.odkazy = z.odkazy || [];
  z.videa = (z.videa || []).map((v) => ({
    id: v.id, nazev: v.nazev, format: v.format === '9:16' ? '9:16' : '16:9',
    vimeo: v.vimeo || '', popis: v.popis ?? v.poznamka ?? '',
  }));
  return z;
}

/* ---------------------------------------------------------- hlášky */

function hlaska(text, druh = '') {
  const e = document.createElement('div');
  e.className = 'hlaska ' + druh;
  e.innerHTML = `<svg class="icon"><use href="#${druh === 'chyba' ? 'i-krizek' : 'i-fajfka'}"/></svg><span>${esc(text)}</span>`;
  $('#hlasky').append(e);
  setTimeout(() => e.remove(), druh === 'chyba' ? 6500 : 2400);
}

/* ---------------------------------------------------------- ukládání */

async function uloz(zprava, kam, uprav) {
  UI.ukladam++;
  $('#btn-obnovit').classList.add('tocise');
  try {
    await GH.zmen(kam, uprav, zprava);
    if (kam === SOUBOR_ZAKAZKY) S.zakazky = GH.mezipamet[kam].data.zakazky.map(normalizuj);
    else S.komentare = GH.mezipamet[kam].data.polozky;
    vykresli();
    return true;
  } catch (e) {
    hlaska(e.message || 'Uložení se nepovedlo.', 'chyba');
    return false;
  } finally {
    UI.ukladam--;
    if (!UI.ukladam) $('#btn-obnovit').classList.remove('tocise');
  }
}

/* Změna jedné zakázky podle id — funguje i po sloučení s cizí verzí. */
const ulozZakazku = (zprava, id, fn) =>
  uloz(zprava, SOUBOR_ZAKAZKY, (d) => { const z = d.zakazky.find((x) => x.id === id); if (z) fn(z); });

/* ---------------------------------------------------------- vykreslení */

function vykresli() {
  if ($('#app').classList.contains('skryto')) return;
  $('#p-aktivni').textContent = S.zakazky.filter((z) => z.stav === 'aktivni').length;
  $('#p-hotove').textContent = S.zakazky.filter((z) => z.stav !== 'aktivni').length;
  $$('.zalozka').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filtr === UI.filtr)));
  vykresliPlochu();
  if (UI.otevrena) vykresliSuplik();
}

function vyfiltrovane() {
  const h = UI.hledat.trim().toLowerCase();
  return S.zakazky
    .filter((z) => (UI.filtr === 'aktivni' ? z.stav === 'aktivni' : z.stav !== 'aktivni'))
    .filter((z) => !h || [z.nazev, z.podnazev, z.kod, z.poznamka, ...z.videa.map((v) => v.nazev + ' ' + v.popis)]
      .join(' ').toLowerCase().includes(h))
    .sort((a, b) => (b.vytvoreno || '').localeCompare(a.vytvoreno || ''));
}

function maNove(z) {
  const posledni = komentareZ(z.id).filter((k) => k.kdo !== JA.jmeno).reduce((m, k) => (k.kdy > m ? k.kdy : m), '');
  return !!posledni && posledni > (videno[z.id] || '');
}

function vykresliPlochu() {
  const seznam = vyfiltrovane();
  const plocha = $('#plocha');

  if (!seznam.length) {
    plocha.innerHTML = `
      <div class="prazdno">
        <h3>${UI.hledat ? 'Nic se nenašlo' : UI.filtr === 'aktivni' ? 'Žádná aktivní zakázka' : 'Archiv je zatím prázdný'}</h3>
        <p>${UI.hledat ? 'Hledáme i v poznámkách a názvech videí.' : UI.filtr === 'aktivni' ? 'Založ zakázku a přidej k ní fotky, vizualizace a videa.' : 'Hotové zakázky se sem přesunou z aktivních.'}</p>
        ${!UI.hledat && UI.filtr === 'aktivni' ? '<button class="btn-nova" style="margin:0 auto" data-akce="nova"><svg class="icon"><use href="#i-plus"/></svg> Nová zakázka</button>' : ''}
      </div>`;
    return;
  }

  plocha.innerHTML = `<div class="mrizka">${seznam.map(karta).join('')}</div>`;
  $$('[data-nahled]', plocha).forEach(dopnutiNahledu);
}

const obalVidea = (z) => z.videa.find((v) => v.format === '16:9' && vimeoInfo(v.vimeo)) || z.videa.find((v) => vimeoInfo(v.vimeo));

function karta(z) {
  const obal = obalVidea(z);
  const info = obal && vimeoInfo(obal.vimeo);
  const siroka = z.videa.filter((v) => v.format === '16:9').length;
  const vysoka = z.videa.filter((v) => v.format === '9:16').length;
  const komentaru = komentareZ(z.id).length;

  return `
    <article class="karta">
      <button class="karta-nahled ${info ? '' : 'bez'}" data-akce="otevri" data-id="${esc(z.id)}"
              ${info ? `data-nahled="${esc(info.id)}" data-hash="${esc(info.hash || '')}"` : ''}
              aria-label="Otevřít ${esc(z.nazev)}">
        ${info ? '' : '<span>Zatím bez videa</span>'}
      </button>
      <span class="karta-kod">${esc(z.kod)}</span>
      ${maNove(z) ? '<span class="karta-nove" title="Nový komentář"></span>' : ''}

      <div class="karta-telo">
        <button class="karta-nadpis" data-akce="otevri" data-id="${esc(z.id)}">
          <h3>${esc(z.nazev)}</h3>
          ${z.podnazev ? `<p>${esc(z.podnazev)}</p>` : ''}
        </button>

        <div class="karta-odkazy">
          ${chipOdkaz('i-foto', 'Fotky', z.fotky, z.id, 'fotky')}
          ${chipOdkaz('i-kostka', 'Vizualizace', z.vizualizace, z.id, 'vizualizace')}
        </div>

        <footer class="karta-pata">
          <span class="${siroka ? 'ma' : ''}">${siroka}× SREALITY</span>
          <span class="${vysoka ? 'ma' : ''}">${vysoka}× REELS</span>
          ${komentaru ? `<span class="vpravo"><svg class="icon"><use href="#i-komentar"/></svg>${komentaru}</span>` : ''}
        </footer>
      </div>
    </article>`;
}

const chipOdkaz = (ikona, popis, url, zid, klic) => url
  ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener"><svg class="icon"><use href="#${ikona}"/></svg><span>${esc(popis)}</span></a>`
  : `<button class="chip chybi" data-akce="odkaz" data-id="${esc(zid)}" data-klic="${klic}"><svg class="icon"><use href="#${ikona}"/></svg><span>${esc(popis)}</span></button>`;

async function dopnutiNahledu(prvek) {
  const { nahled: id, hash } = prvek.dataset;
  try {
    const url = await vimeoNahled({ id, hash, verejny: `https://vimeo.com/${id}${hash ? '/' + hash : ''}` });
    const img = new Image();
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    prvek.prepend(img);
  } catch { /* náhled není povinný */ }
}

/* ---------------------------------------------------------- detail */

function vykresliSuplik() {
  const suplik = $('#suplik');
  const aktivni = document.activeElement;
  if (suplik.contains(aktivni) && /INPUT|TEXTAREA/.test(aktivni.tagName)) return;

  const z = najdi(UI.otevrena);
  if (!z) return zavri();

  const rozepsany = $('#novy-komentar', suplik)?.value || '';
  const posun = $('.suplik-telo', suplik)?.scrollTop || 0;

  suplik.innerHTML = htmlDetail(z);

  if (rozepsany) $('#novy-komentar', suplik).value = rozepsany;
  if (posun) $('.suplik-telo', suplik).scrollTop = posun;
  $$('[data-nahled]', suplik).forEach(dopnutiNahledu);
  $$('textarea', suplik).forEach(dorovnej);
}

function dorovnej(pole) {
  pole.style.height = 'auto';
  pole.style.height = Math.min(pole.scrollHeight + 2, 420) + 'px';
}

function htmlDetail(z) {
  const komentare = komentareZ(z.id).slice().sort((a, b) => b.kdy.localeCompare(a.kdy));

  return `
    <div class="suplik-hlava">
      <div class="sh-radek">
        <span class="kod">${esc(z.kod)}</span>
        <span class="rozpera"></span>
        <button class="mini" data-akce="prehodit">${z.stav === 'aktivni' ? 'Označit jako hotové' : 'Vrátit mezi aktivní'}</button>
        <button class="ikonbtn" data-akce="zavri" aria-label="Zavřít"><svg class="icon"><use href="#i-krizek"/></svg></button>
      </div>
      <h2><input class="vstup" data-pole="nazev" value="${esc(z.nazev)}" style="font:inherit" aria-label="Název zakázky"></h2>
      <input class="vstup" data-pole="podnazev" value="${esc(z.podnazev || '')}" placeholder="Dispozice, lokalita, plocha…" style="color:var(--muted);font-size:13px" aria-label="Popis zakázky">
    </div>

    <div class="suplik-telo">
      <div class="blok">
        <div class="blok-hlava">
          <h3>Odkazy</h3>
          <button class="pridat vpravo" data-akce="pridat-odkaz"><svg class="icon"><use href="#i-plus"/></svg> Další odkaz</button>
        </div>
        <div class="odkazy">
          ${dlazdiceOdkaz('i-foto', 'Fotky', z.fotky, 'fotky')}
          ${dlazdiceOdkaz('i-kostka', 'Vizualizace', z.vizualizace, 'vizualizace')}
          ${z.odkazy.map((o, i) => `
            <a class="chip" href="${esc(o.url)}" target="_blank" rel="noopener">
              <svg class="icon"><use href="#i-odkaz"/></svg>
              <span>${esc(o.nazev)}<small>otevřít</small></span>
              <span class="zmenit" data-akce="smazat-odkaz" data-i="${i}" role="button" tabindex="0" title="Odebrat"><svg class="icon"><use href="#i-krizek"/></svg></span>
            </a>`).join('')}
        </div>
      </div>

      <div class="blok">
        <div class="blok-hlava">
          <h3>Videa</h3><span class="pocitadlo">${z.videa.length}</span>
          <button class="pridat vpravo" data-akce="pridat-video"><svg class="icon"><use href="#i-plus"/></svg> Přidat video</button>
        </div>
        ${z.videa.length
          ? `<div class="videa">${z.videa.map(videoKarta).join('')}</div>`
          : '<p class="prazdna-poznamka">Zatím tu žádné video není.</p>'}
      </div>

      <div class="blok">
        <div class="blok-hlava"><h3>Poznámka</h3></div>
        <textarea class="vstup" data-pole="poznamka" placeholder="Co je u téhle zakázky důležité…">${esc(z.poznamka || '')}</textarea>
      </div>

      <div class="blok">
        <div class="blok-hlava"><h3>Komentáře</h3><span class="pocitadlo">${komentare.length}</span></div>
        <div class="napsat">
          <textarea class="vstup" id="novy-komentar" placeholder="Napsat druhé straně…" rows="2"></textarea>
          <div class="napsat-akce">
            <span class="napoveda">Podepíše se jako ${esc(JA.jmeno)}</span>
            <button class="btn-poslat" data-akce="komentar">Odeslat</button>
          </div>
        </div>
        <div class="vlakno">
          ${komentare.map(zpravaHtml).join('') || '<p class="prazdna-poznamka">Zatím tu nikdo nic nenapsal.</p>'}
        </div>
      </div>

      <div class="blok" style="padding-bottom:32px">
        <button class="mini zrus" data-akce="smazat-zakazku"><svg class="icon"><use href="#i-kos"/></svg> Smazat zakázku</button>
      </div>
    </div>`;
}

const dlazdiceOdkaz = (ikona, popis, url, klic) => url
  ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener">
       <svg class="icon"><use href="#${ikona}"/></svg>
       <span>${esc(popis)}<small>otevřít</small></span>
       <span class="zmenit" data-akce="odkaz" data-klic="${klic}" role="button" tabindex="0" title="Změnit odkaz"><svg class="icon"><use href="#i-tuzka"/></svg></span>
     </a>`
  : `<button class="chip chybi" data-akce="odkaz" data-klic="${klic}">
       <svg class="icon"><use href="#${ikona}"/></svg>
       <span>${esc(popis)}<small>doplnit</small></span>
     </button>`;

function videoKarta(v) {
  const info = vimeoInfo(v.vimeo);
  return `
    <div class="video-karta ${v.format === '9:16' ? 'w916' : 'w169'}">
      ${info
        ? `<div class="vk-ramecek">
             <button class="vk-prehrat" data-akce="prehrat" data-vid="${esc(v.id)}" data-nahled="${esc(info.id)}" data-hash="${esc(info.hash || '')}" aria-label="Přehrát ${esc(v.nazev)}">
               <span class="kolecko"><svg class="icon"><use href="#i-prehrat"/></svg></span>
             </button>
           </div>`
        : `<button class="vk-bezodkazu" data-akce="video-upravit" data-vid="${esc(v.id)}">
             <svg class="icon"><use href="#i-odkaz"/></svg>
             <span><b>Vložit odkaz na Vimeo</b>Video se pak přehraje rovnou tady.</span>
           </button>`}
      <div class="vk-telo">
        <div class="vk-radek">
          <span class="vk-nazev">${esc(v.nazev)}</span>
          <span class="vk-format">${v.format === '9:16' ? '9:16 REELS' : '16:9 SREALITY'}</span>
        </div>
        ${v.popis ? `<p class="vk-popis">${esc(v.popis)}</p>` : ''}
        <div class="vk-akce">
          <button class="mini" data-akce="video-upravit" data-vid="${esc(v.id)}"><svg class="icon"><use href="#i-tuzka"/></svg> Upravit</button>
          ${info ? `<a class="mini" href="${esc(info.verejny)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-odkaz"/></svg> Vimeo</a>` : ''}
          <button class="mini zrus vpravo" data-akce="video-smazat" data-vid="${esc(v.id)}" aria-label="Smazat video"><svg class="icon"><use href="#i-kos"/></svg></button>
        </div>
      </div>
    </div>`;
}

const zpravaHtml = (k) => `
  <div class="zprava">
    <span class="avatar ${k.role === 'klient' ? 'klient' : ''}">${esc(iniciely(k.kdo))}</span>
    <div class="zprava-telo">
      <div class="zprava-hlava">
        <span class="zprava-kdo">${esc(k.kdo)}</span>
        <span class="zprava-kdy" title="${esc(dtPlne.format(new Date(k.kdy)))}">${esc(kdyKratce(k.kdy))}</span>
      </div>
      <div class="zprava-text">${esc(k.text)}</div>
    </div>
    <button class="smazat" data-akce="smazat-komentar" data-kid="${esc(k.id)}" aria-label="Smazat komentář"><svg class="icon"><use href="#i-krizek"/></svg></button>
  </div>`;

/* ---------------------------------------------------------- šuplík */

function otevri(id) {
  UI.otevrena = id;
  videno[id] = nyni();
  ulozVideno();
  $('#suplik').classList.add('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'false');
  $('#zaves').classList.add('otevreno');
  document.body.style.overflow = 'hidden';
  vykresliSuplik();
  $('.suplik-telo')?.scrollTo(0, 0);
  vykresliPlochu();
}

function zavri() {
  UI.otevrena = null;
  $('#suplik').classList.remove('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'true');
  $('#zaves').classList.remove('otevreno');
  document.body.style.overflow = '';
  vykresliPlochu();
}

/* ---------------------------------------------------------- dialog */

function dialogPole(p) {
  const id = 'dp-' + p.klic;
  let vstup;
  if (p.typ === 'textarea') vstup = `<textarea id="${id}" name="${p.klic}" placeholder="${esc(p.placeholder || '')}">${esc(p.hodnota || '')}</textarea>`;
  else if (p.typ === 'prepinac') vstup = `<div class="prepinac-dva" data-prepinac="${p.klic}">
      ${p.volby.map((v) => `<button type="button" data-hodnota="${esc(v.id)}" aria-pressed="${v.id === p.hodnota}">${esc(v.nazev)}</button>`).join('')}
      <input type="hidden" name="${p.klic}" value="${esc(p.hodnota)}">
    </div>`;
  else vstup = `<input id="${id}" name="${p.klic}" type="${p.typ || 'text'}" value="${esc(p.hodnota || '')}" placeholder="${esc(p.placeholder || '')}">`;

  return `<div class="dlg-pole"><label for="${id}">${esc(p.label)}</label>${vstup}${p.napoveda ? `<span class="napoveda">${esc(p.napoveda)}</span>` : ''}</div>`;
}

function dialog({ titulek, popis, pole = [], okText = 'Uložit', nebezpeci = false }) {
  const dlg = $('#dlg');
  $('#dlg-titulek').textContent = titulek;
  $('#dlg-popis').textContent = popis || '';
  $('#dlg-popis').classList.toggle('skryto', !popis);
  $('#dlg-telo').innerHTML = pole.map(dialogPole).join('');
  $('#dlg-ok').textContent = okText;
  $('#dlg-ok').classList.toggle('nebezpeci', nebezpeci);

  $$('[data-prepinac]', dlg).forEach((skup) => skup.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-hodnota]');
    if (!b) return;
    $$('button', skup).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('input', skup).value = b.dataset.hodnota;
  }));

  dlg.showModal();
  setTimeout(() => $('#dlg-telo input:not([type=hidden]), #dlg-telo textarea')?.focus(), 40);

  return new Promise((hotovo) => {
    const uklid = () => {
      $('#dlg-form').removeEventListener('submit', odeslat);
      $('#dlg-zrusit').removeEventListener('click', zrusit);
      dlg.removeEventListener('cancel', zavreno);
    };
    function odeslat(e) {
      e.preventDefault();
      const out = {};
      for (const [k, v] of new FormData($('#dlg-form')).entries()) out[k] = typeof v === 'string' ? v.trim() : v;
      uklid(); dlg.close(); hotovo(out);
    }
    function zrusit() { uklid(); dlg.close(); hotovo(null); }
    function zavreno() { uklid(); hotovo(null); }
    $('#dlg-form').addEventListener('submit', odeslat);
    $('#dlg-zrusit').addEventListener('click', zrusit);
    dlg.addEventListener('cancel', zavreno);
  });
}

const potvrd = async (o) => (await dialog({ ...o, pole: [], nebezpeci: true })) !== null;

/* ---------------------------------------------------------- akce */

async function akce(jmeno, prvek) {
  const d = prvek.dataset;

  if (jmeno === 'zavri') return zavri();
  if (jmeno === 'nova') return novaZakazka();
  if (jmeno === 'otevri') return otevri(d.id);

  /* odkaz na fotky nebo vizualizace jde upravit i z karty na nástěnce */
  if (jmeno === 'odkaz') {
    const z = najdi(d.id || UI.otevrena);
    if (!z) return;
    const popis = d.klic === 'fotky' ? 'Fotky' : 'Vizualizace';
    const v = await dialog({
      titulek: popis,
      popis: 'Vlož odkaz na Google Drive, Úschovnu, Zoner, galerii — cokoliv, co se dá otevřít v prohlížeči.',
      pole: [{ klic: 'url', label: 'Odkaz', typ: 'url', hodnota: z[d.klic] || '', placeholder: 'https://…' }],
    });
    if (!v) return;
    return ulozZakazku(`${z.kod} — ${popis.toLowerCase()}`, z.id, (x) => { x[d.klic] = v.url; });
  }

  const z = najdi(UI.otevrena);
  if (!z) return;

  if (jmeno === 'prehodit') {
    const hotove = z.stav === 'aktivni';
    await ulozZakazku(`${z.kod} — ${hotove ? 'hotové' : 'zpět mezi aktivní'}`, z.id, (x) => { x.stav = hotove ? 'hotove' : 'aktivni'; });
    UI.filtr = hotove ? 'hotove' : 'aktivni';
    localStorage.setItem('kokpit.filtr', UI.filtr);
    vykresli();
    return hlaska(hotove ? 'Přesunuto mezi hotové.' : 'Zpátky mezi aktivními.', 'uspech');
  }

  if (jmeno === 'pridat-odkaz') {
    const v = await dialog({
      titulek: 'Další odkaz',
      pole: [
        { klic: 'nazev', label: 'Jak se jmenuje', hodnota: '', placeholder: 'Např. Inzerát nebo Půdorysy' },
        { klic: 'url', label: 'Odkaz', typ: 'url', hodnota: '', placeholder: 'https://…' },
      ],
    });
    if (!v?.url) return;
    return ulozZakazku(`${z.kod} — přidán odkaz`, z.id, (x) => { (x.odkazy = x.odkazy || []).push({ nazev: v.nazev || 'Odkaz', url: v.url }); });
  }

  if (jmeno === 'smazat-odkaz') {
    return ulozZakazku(`${z.kod} — odebrán odkaz`, z.id, (x) => { x.odkazy.splice(Number(d.i), 1); });
  }

  if (jmeno === 'pridat-video' || jmeno === 'video-upravit') {
    const v = jmeno === 'video-upravit' ? z.videa.find((x) => x.id === d.vid) : null;
    const data = await dialog({
      titulek: v ? 'Upravit video' : 'Nové video',
      pole: [
        { klic: 'nazev', label: 'Název', hodnota: v?.nazev || '', placeholder: 'Např. Prohlídka domu' },
        { klic: 'format', label: 'Formát', typ: 'prepinac', hodnota: v?.format || '16:9', volby: [{ id: '16:9', nazev: '16:9 Sreality' }, { id: '9:16', nazev: '9:16 Reels' }] },
        { klic: 'vimeo', label: 'Odkaz na Vimeo', hodnota: v?.vimeo || '', placeholder: 'https://vimeo.com/123456789', napoveda: 'Funguje veřejný i skrytý odkaz včetně hashe (vimeo.com/123456789/abc123).' },
        { klic: 'popis', label: 'Popis', typ: 'textarea', hodnota: v?.popis || '', placeholder: 'Délka, styl, co se v něm mění…' },
      ],
    });
    if (!data?.nazev) return;
    if (data.vimeo && !vimeoInfo(data.vimeo)) return hlaska('Tenhle odkaz nevypadá jako Vimeo. Zkontroluj ho.', 'chyba');

    return v
      ? ulozZakazku(`${z.kod} — upraveno video ${data.nazev}`, z.id, (x) => { Object.assign(x.videa.find((y) => y.id === v.id), data); })
      : ulozZakazku(`${z.kod} — přidáno video ${data.nazev}`, z.id, (x) => { (x.videa = x.videa || []).push({ id: uid('v'), ...data }); });
  }

  if (jmeno === 'video-smazat') {
    const v = z.videa.find((x) => x.id === d.vid);
    if (!v || !await potvrd({ titulek: 'Smazat video?', popis: `„${v.nazev}" zmizí z kokpitu. Soubor na Vimeu zůstane, kde je.`, okText: 'Smazat' })) return;
    return ulozZakazku(`${z.kod} — smazáno video ${v.nazev}`, z.id, (x) => { x.videa = x.videa.filter((y) => y.id !== v.id); });
  }

  if (jmeno === 'prehrat') {
    const info = vimeoInfo(z.videa.find((x) => x.id === d.vid)?.vimeo);
    if (!info) return;
    prvek.closest('.vk-ramecek').innerHTML =
      `<iframe src="${esc(info.embed)}&autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="video"></iframe>`;
    return;
  }

  if (jmeno === 'komentar') {
    const pole = $('#novy-komentar');
    const text = pole.value.trim();
    if (!text) return;
    pole.value = '';
    const ok = await uloz(`${z.kod} — komentář`, SOUBOR_KOMENTARE, (dd) => {
      dd.polozky.push({ id: uid('k'), kdy: nyni(), kdo: JA.jmeno, role: JA.role, zakazka: z.id, text });
      if (dd.polozky.length > 800) dd.polozky = dd.polozky.slice(-800);
    });
    if (!ok) pole.value = text;
    return;
  }

  if (jmeno === 'smazat-komentar') {
    if (!await potvrd({ titulek: 'Smazat komentář?', okText: 'Smazat' })) return;
    return uloz(`${z.kod} — smazán komentář`, SOUBOR_KOMENTARE, (dd) => { dd.polozky = dd.polozky.filter((k) => k.id !== d.kid); });
  }

  if (jmeno === 'smazat-zakazku') {
    if (!await potvrd({
      titulek: 'Smazat zakázku?',
      popis: `„${z.nazev}" zmizí i s videi a komentáři. Zůstane v historii na GitHubu, odkud ji Franta umí vrátit.`,
      okText: 'Smazat',
    })) return;
    const ok = await uloz(`Smazána zakázka ${z.kod} — ${z.nazev}`, SOUBOR_ZAKAZKY, (dd) => { dd.zakazky = dd.zakazky.filter((x) => x.id !== z.id); });
    if (ok) { zavri(); hlaska('Zakázka smazána.', 'uspech'); }
  }
}

async function novaZakazka() {
  const v = await dialog({
    titulek: 'Nová zakázka',
    pole: [
      { klic: 'nazev', label: 'Název', hodnota: '', placeholder: 'Např. Vinohrady — Bělehradská' },
      { klic: 'podnazev', label: 'Popis', hodnota: '', placeholder: 'Např. Byt 3+kk · 92 m² · Praha 2' },
    ],
    okText: 'Založit',
  });
  if (!v?.nazev) return;

  const rok = String(new Date().getFullYear()).slice(2);
  const cislo = S.zakazky.filter((z) => (z.kod || '').startsWith(rok + '-')).length + 1;
  const nova = {
    id: uid('z'),
    kod: `${rok}-${String(cislo).padStart(2, '0')}`,
    nazev: v.nazev,
    podnazev: v.podnazev,
    stav: 'aktivni',
    fotky: '',
    vizualizace: '',
    odkazy: [],
    videa: [],
    poznamka: '',
    vytvoreno: nyni(),
  };
  UI.filtr = 'aktivni';
  localStorage.setItem('kokpit.filtr', UI.filtr);
  if (await uloz(`Nová zakázka ${nova.kod} — ${nova.nazev}`, SOUBOR_ZAKAZKY, (d) => { d.zakazky.unshift(nova); })) otevri(nova.id);
}

async function ulozPole(prvek) {
  const z = najdi(UI.otevrena);
  if (!z) return;
  const klic = prvek.dataset.pole;
  if (String(z[klic] ?? '') === prvek.value) return;
  const nazvy = { nazev: 'název', podnazev: 'popis', poznamka: 'poznámku' };
  await ulozZakazku(`${z.kod} — ${nazvy[klic] || klic}`, z.id, (x) => { x[klic] = prvek.value; });
}

/* ---------------------------------------------------------- načtení */

async function nactiVse({ podminene = false } = {}) {
  const [z, k] = await Promise.all([
    GH.nacti(SOUBOR_ZAKAZKY, { podminene }),
    GH.nacti(SOUBOR_KOMENTARE, { podminene }),
  ]);
  let zmena = false;
  if (z.zmeneno) { S.zakazky = (z.data.zakazky || []).map(normalizuj); zmena = true; }
  if (k.zmeneno) { S.komentare = k.data.polozky || []; zmena = true; }
  if (zmena) {
    localStorage.setItem('kokpit.cache', JSON.stringify({ zakazky: S.zakazky, komentare: S.komentare }));
    vykresli();
  }
  return zmena;
}

let bezi = false;

async function synchronizuj(hlasitost = 'ticho') {
  if (bezi || UI.ukladam) return;
  bezi = true;
  if (hlasitost === 'nahlas') $('#btn-obnovit').classList.add('tocise');
  try {
    const zmena = await nactiVse({ podminene: true });
    if (hlasitost === 'nahlas') hlaska(zmena ? 'Načteno znovu.' : 'Máš nejnovější verzi.', 'uspech');
  } catch (e) {
    if (hlasitost === 'nahlas') hlaska(e.message, 'chyba');
  } finally {
    bezi = false;
    if (!UI.ukladam) $('#btn-obnovit').classList.remove('tocise');
  }
}

/* ---------------------------------------------------------- start */

function odhlas(duvod) {
  localStorage.removeItem('kokpit.sez');
  GH.token = null;
  $('#app').classList.add('skryto');
  $('#zamek').classList.remove('skryto');
  $('#zamek-chyba').textContent = duvod || '';
}

async function spust(token, role, jmeno) {
  GH.token = token;
  JA.role = role;
  JA.jmeno = jmeno;
  $('#me-avatar').textContent = iniciely(jmeno);
  $('#me-avatar').classList.toggle('klient', role === 'klient');
  $('#zamek').classList.add('skryto');
  $('#app').classList.remove('skryto');

  try {
    const c = JSON.parse(localStorage.getItem('kokpit.cache') || 'null');
    if (c) { S.zakazky = (c.zakazky || []).map(normalizuj); S.komentare = c.komentare || []; vykresli(); }
  } catch {}

  try {
    await nactiVse();
    if (!Object.keys(videno).length) {
      S.zakazky.forEach((z) => { videno[z.id] = nyni(); });
      ulozVideno();
      vykresli();
    }
  } catch (e) {
    if (/odmítl přístup/.test(e.message)) return odhlas(e.message);
    hlaska(e.message, 'chyba');
  }

  setInterval(() => { if (document.visibilityState === 'visible') synchronizuj(); }, 25000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') synchronizuj(); });
}

/* ---------------------------------------------------------- posluchači */

$('#zamek-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#zamek-btn');
  $('#zamek-chyba').textContent = '';
  btn.disabled = true;
  btn.textContent = 'Odemykám…';
  try {
    const vysledek = await odemkni($('#zamek-heslo').value);
    if (!vysledek) {
      $('#zamek-chyba').textContent = 'Tohle heslo nesedí.';
      $('#zamek-heslo').select();
      return;
    }
    let jmeno = localStorage.getItem('kokpit.jmeno');
    if (!jmeno) {
      const v = await dialog({
        titulek: 'Jak se podepisovat?',
        popis: 'Tohle jméno uvidí druhá strana u každého komentáře.',
        pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: vysledek.role === 'klient' ? 'Honza' : 'Franta' }],
        okText: 'Pokračovat',
      });
      if (!v?.jmeno) return;
      jmeno = v.jmeno.trim().slice(0, 40);
      localStorage.setItem('kokpit.jmeno', jmeno);
    }
    localStorage.setItem('kokpit.sez', JSON.stringify({ token: vysledek.token, role: vysledek.role }));
    await spust(vysledek.token, vysledek.role, jmeno);
  } catch (err) {
    $('#zamek-chyba').textContent = 'Něco se pokazilo: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Otevřít';
  }
});

document.addEventListener('click', (e) => {
  const prvek = e.target.closest('[data-akce]');
  if (prvek) { e.preventDefault(); return akce(prvek.dataset.akce, prvek); }
  if (e.target.closest('#zaves')) zavri();
});

document.addEventListener('change', (e) => { if (e.target.matches('[data-pole]')) ulozPole(e.target); });
document.addEventListener('input', (e) => { if (e.target.matches('#suplik textarea')) dorovnej(e.target); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && UI.otevrena && !$('#dlg').open) zavri();
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); $('#hledat').focus(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'novy-komentar') akce('komentar', e.target);
});

$('#hledat').addEventListener('input', (e) => { UI.hledat = e.target.value; vykresliPlochu(); });

$('.zalozky').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtr]');
  if (!b) return;
  UI.filtr = b.dataset.filtr;
  localStorage.setItem('kokpit.filtr', UI.filtr);
  vykresli();
});

$('#btn-nova').addEventListener('click', novaZakazka);
$('#btn-obnovit').addEventListener('click', () => synchronizuj('nahlas'));

$('#btn-role').addEventListener('click', async () => {
  const v = await dialog({
    titulek: 'Podpis',
    popis: `Jsi přihlášený za ${JA.role === 'klient' ? 'Chundela Reality' : 'studio'}. Pod tímhle jménem se podepisují komentáře.`,
    pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: JA.jmeno }],
    okText: 'Uložit',
  });
  if (!v?.jmeno) return;
  JA.jmeno = v.jmeno.trim();
  localStorage.setItem('kokpit.jmeno', JA.jmeno);
  $('#me-avatar').textContent = iniciely(JA.jmeno);
  vykresli();
});

/* obnovení sezení */
(async () => {
  if (!window.CFG?.blobs || !Object.values(CFG.blobs).some(Boolean)) {
    $('#zamek-chyba').textContent = 'Kokpit ještě nemá nastavený přístup. Spusť nastavení podle README.';
    $('#zamek-heslo').disabled = true;
    $('#zamek-btn').disabled = true;
    return;
  }
  try {
    const sez = JSON.parse(localStorage.getItem('kokpit.sez') || 'null');
    const jmeno = localStorage.getItem('kokpit.jmeno');
    if (sez?.token && jmeno) await spust(sez.token, sez.role, jmeno);
  } catch {}
})();
