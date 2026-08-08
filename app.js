/* ============================================================
   Produkční kokpit — Chundela Reality × František Dron
   Data žijí v privátním repu na GitHubu. Každá změna = commit,
   takže je vidět kdo, co a kdy, a nic se nedá nenávratně ztratit.
   ============================================================ */

/* ---------------------------------------------------------- pomocníci */

const $  = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
const nyni = () => new Date().toISOString();
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);

const FAZE = [
  { id: 'poptavka',  nazev: 'Poptávka' },
  { id: 'nataceni',  nazev: 'Natáčení' },
  { id: 'strih',     nazev: 'Střih' },
  { id: 'schvaleni', nazev: 'Ke schválení' },
  { id: 'hotovo',    nazev: 'Odevzdáno' },
];
const fazeIndex = (id) => Math.max(0, FAZE.findIndex((f) => f.id === id));
const fazeNazev = (id) => (FAZE.find((f) => f.id === id) || FAZE[0]).nazev;

const STAVY_VIDEA = {
  vyroba:       'Ve výrobě',
  ke_schvaleni: 'Ke schválení',
  uprava:       'Chce úpravy',
  odevzdano:    'Schváleno',
};

const ODKAZY_POPIS = {
  fotky:       { popis: 'Fotky',       ikona: 'i-foto' },
  vizualizace: { popis: 'Vizualizace', ikona: 'i-kostka' },
  inzerat:     { popis: 'Inzerát',     ikona: 'i-inzerat' },
  podklady:    { popis: 'Podklady',    ikona: 'i-slozka' },
};

/* ---------------------------------------------------------- datum a čas */

const dtDen = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const dtKratce = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const dtPlne = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function kdyKratce(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${Math.floor(min)} min`;
  if (min < 24 * 60) return `před ${Math.floor(min / 60)} h`;
  if (min < 48 * 60) return 'včera';
  if (min < 7 * 24 * 60) return `před ${Math.floor(min / 1440)} dny`;
  return dtKratce.format(d) + '.';
}

function denKratce(datum) {
  if (!datum) return '';
  const d = new Date(datum + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return datum;
  return dtKratce.format(d) + '.';
}

function dniDo(datum) {
  if (!datum) return null;
  const d = new Date(datum + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - new Date().setHours(12, 0, 0, 0)) / 86400000);
}

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

const thumbCache = new Map();

async function vimeoNahled(info) {
  const klic = 'kokpit.thumb.' + info.id;
  if (thumbCache.has(info.id)) return thumbCache.get(info.id);
  const ulozeny = localStorage.getItem(klic);
  if (ulozeny) { thumbCache.set(info.id, ulozeny); return ulozeny; }
  const url = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(info.verejny)}&width=800`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('bez náhledu');
  const j = await r.json();
  if (!j.thumbnail_url) throw new Error('bez náhledu');
  localStorage.setItem(klic, j.thumbnail_url);
  thumbCache.set(info.id, j.thumbnail_url);
  return j.thumbnail_url;
}

/* ---------------------------------------------------------- šifrování */

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
  const sul = raw.slice(0, 16), iv = raw.slice(16, 28), sifra = raw.slice(28);
  const zaklad = await crypto.subtle.importKey('raw', new TextEncoder().encode(heslo), 'PBKDF2', false, ['deriveKey']);
  const klic = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sul, iterations: CFG.iterace || 600000, hash: 'SHA-256' },
    zaklad, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, klic, sifra));
}

async function odemkni(heslo) {
  for (const [role, blob] of Object.entries(CFG.blobs || {})) {
    if (!blob) continue;
    try {
      const token = await desifruj(blob, heslo);
      if (/^(github_pat_|ghp_|gho_)/.test(token)) return { role, token: token.trim() };
    } catch { /* špatné heslo pro tenhle blob — zkus další */ }
  }
  return null;
}

/* ---------------------------------------------------------- GitHub */

const SOUBOR_ZAKAZKY = 'data/zakazky.json';
const SOUBOR_AKTIVITA = 'data/aktivita.json';

const GH = {
  token: null,
  etag: {},
  mezipamet: {},

  async volej(cesta, nastaveni = {}) {
    return fetch('https://api.github.com' + cesta, {
      cache: 'no-store',
      ...nastaveni,
      headers: {
        Authorization: 'Bearer ' + GH.token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(nastaveni.headers || {}),
      },
    });
  },

  cesta: (soubor) => `/repos/${CFG.owner}/${CFG.repo}/contents/${soubor}`,

  async chyba(r) {
    let detail = '';
    try { detail = (await r.json()).message || ''; } catch {}
    if (r.status === 401) return 'GitHub odmítl přístup — token vypršel nebo byl zrušen. Ozvi se Frantovi.';
    if (r.status === 403) return 'GitHub přístup zamítl. Token možná nemá právo zapisovat.';
    if (r.status === 404) return 'Datový soubor se nenašel. Zkontroluj nastavení repozitáře.';
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

  async zapis(soubor, obsah, sha, zprava) {
    const telo = { message: zprava, content: textNaB64(JSON.stringify(obsah, null, 2)), branch: CFG.branch };
    if (sha) telo.sha = sha;
    const r = await GH.volej(GH.cesta(soubor), { method: 'PUT', body: JSON.stringify(telo) });
    if (r.status === 409 || r.status === 422) return { konflikt: true };
    if (!r.ok) throw new Error(await GH.chyba(r));
    const j = await r.json();
    delete GH.etag[soubor];
    return { sha: j.content.sha };
  },

  /* Zápis odolný proti souběhu: když někdo uložil mezitím,
     načteme jeho verzi a naši změnu na ni pustíme znovu. */
  async zmen(soubor, uprav, zprava) {
    let konfliktu = 0;
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
      const vysledek = await GH.zapis(soubor, kopie, ulozene.sha, zprava);
      if (!vysledek.konflikt) {
        GH.mezipamet[soubor] = { data: kopie, sha: vysledek.sha };
        return { data: kopie, konfliktu };
      }
      konfliktu++;
      await pauza(250 * (pokus + 1));
    }
    throw new Error('Nepovedlo se uložit — někdo jiný právě ukládá to samé. Zkus to za chvíli.');
  },
};

/* ---------------------------------------------------------- stav */

const JA = { role: null, jmeno: null };

const S = { zakazky: [], aktivita: [] };

const UI = {
  filtr: localStorage.getItem('kokpit.filtr') || 'aktivni',
  pohled: localStorage.getItem('kokpit.pohled') || 'karty',
  hledat: '',
  jenMe: false,
  otevrena: null,
  ukladam: 0,
};

const videno = JSON.parse(localStorage.getItem('kokpit.videno') || '{}');
const ulozVideno = () => localStorage.setItem('kokpit.videno', JSON.stringify(videno));

const najdi = (id) => S.zakazky.find((z) => z.id === id);
const mojeStrana = () => (JA.role === 'klient' ? 'klient' : 'studio');

/* ---------------------------------------------------------- odvozené */

function cekaNa(z) {
  const out = { studio: [], klient: [] };
  if (z.stav !== 'aktivni') return out;
  (z.ukoly || []).filter((u) => !u.hotovo).forEach((u) => {
    out[u.strana === 'klient' ? 'klient' : 'studio'].push({ z, text: u.text });
  });
  (z.videa || []).forEach((v) => {
    if (v.stav === 'ke_schvaleni') out.klient.push({ z, text: `schválit „${v.nazev}"` });
    if (v.stav === 'uprava') out.studio.push({ z, text: `zapracovat úpravy — „${v.nazev}"` });
  });
  return out;
}

function cekaCelkem() {
  const out = { studio: [], klient: [] };
  S.zakazky.forEach((z) => {
    const c = cekaNa(z);
    out.studio.push(...c.studio);
    out.klient.push(...c.klient);
  });
  return out;
}

const komentareZ = (id) => S.aktivita.filter((a) => a.zakazka === id && a.typ === 'komentar');

function maNoveZmeny(z) {
  const posledni = S.aktivita
    .filter((a) => a.zakazka === z.id && a.kdo !== JA.jmeno)
    .reduce((max, a) => (a.kdy > max ? a.kdy : max), '');
  if (!posledni) return false;
  return posledni > (videno[z.id] || '');
}

function vyfiltrovane() {
  const h = UI.hledat.trim().toLowerCase();
  return S.zakazky
    .filter((z) => {
      if (UI.filtr === 'kos') return z.stav === 'kos';
      if (z.stav === 'kos') return false;
      if (UI.filtr === 'aktivni') return z.stav === 'aktivni';
      if (UI.filtr === 'archiv') return z.stav === 'archiv';
      return true;
    })
    .filter((z) => {
      if (!UI.jenMe) return true;
      return cekaNa(z)[mojeStrana()].length > 0;
    })
    .filter((z) => {
      if (!h) return true;
      const kupa = [z.nazev, z.podnazev, z.kod, z.poznamka,
        ...(z.videa || []).map((v) => v.nazev + ' ' + v.poznamka),
        ...(z.ukoly || []).map((u) => u.text)].join(' ').toLowerCase();
      return kupa.includes(h);
    })
    .sort((a, b) => {
      if (a.stav !== b.stav) return a.stav === 'aktivni' ? -1 : 1;
      return (b.vytvoreno || '').localeCompare(a.vytvoreno || '');
    });
}

/* ---------------------------------------------------------- hlášky */

function hlaska(text, druh = '') {
  const box = $('#hlasky');
  const e = document.createElement('div');
  e.className = 'hlaska ' + druh;
  const ikona = druh === 'uspech' ? 'i-fajfka' : druh === 'chyba' ? 'i-krizek' : 'i-blesk';
  e.innerHTML = `<svg class="icon"><use href="#${ikona}"/></svg><span>${esc(text)}</span>`;
  box.append(e);
  setTimeout(() => e.remove(), druh === 'chyba' ? 6500 : 2600);
  return e;
}

/* ---------------------------------------------------------- ukládání */

async function uloz(popisZmeny, upravZakazky, zaznam) {
  UI.ukladam++;
  $('#btn-obnovit')?.classList.add('tocise');
  try {
    if (upravZakazky) {
      await GH.zmen(SOUBOR_ZAKAZKY, (d) => {
        upravZakazky(d);
        d.zakazky.forEach((z) => { if (z.id === UI.otevrena?.id) z.aktualizovano = nyni(); });
      }, popisZmeny);
      S.zakazky = GH.mezipamet[SOUBOR_ZAKAZKY].data.zakazky;
    }
    if (zaznam) {
      await GH.zmen(SOUBOR_AKTIVITA, (d) => {
        d.polozky.push({ id: uid('a'), kdy: nyni(), kdo: JA.jmeno, role: JA.role, ...zaznam });
        if (d.polozky.length > 600) d.polozky = d.polozky.slice(-600);
      }, popisZmeny);
      S.aktivita = GH.mezipamet[SOUBOR_AKTIVITA].data.polozky;
    }
    vykresli();
    return true;
  } catch (e) {
    hlaska(e.message || 'Uložení se nepovedlo.', 'chyba');
    return false;
  } finally {
    UI.ukladam--;
    if (!UI.ukladam) $('#btn-obnovit')?.classList.remove('tocise');
  }
}

/* Zkratka: změna jedné zakázky podle id. */
function upravZak(id, fn) {
  return (d) => {
    const z = d.zakazky.find((x) => x.id === id);
    if (z) { fn(z); z.aktualizovano = nyni(); }
  };
}

/* ---------------------------------------------------------- vykreslení */

function vykresli() {
  if (!$('#app') || $('#app').classList.contains('skryto')) return;
  vykresliVolaciList();
  vykresliOvladani();
  vykresliPlochu();
  if (UI.otevrena) vykresliSuplik();
}

function vykresliVolaciList() {
  $('#vl-datum').textContent = dtDen.format(new Date());
  const c = cekaCelkem();
  for (const [strana, prvek, pocet] of [['studio', '#vl-studio', '#vl-pocet-studio'], ['klient', '#vl-klient', '#vl-pocet-klient']]) {
    const polozky = c[strana];
    $(pocet).textContent = polozky.length;
    $(pocet).classList.toggle('nula', polozky.length === 0);
    $(prvek).innerHTML = polozky.length
      ? polozky.slice(0, 6).map((p) => `
        <button class="vl-radek" data-akce="otevri" data-id="${esc(p.z.id)}">
          <span class="kod">${esc(p.z.kod)}</span>
          <span>${esc(p.z.nazev.split('—')[0].trim())} — ${esc(p.text)}</span>
        </button>`).join('')
        + (polozky.length > 6 ? `<p class="vl-prazdno" style="padding-left:8px">…a další ${polozky.length - 6}</p>` : '')
      : `<p class="vl-prazdno">Nic nevisí.</p>`;
  }
}

function vykresliOvladani() {
  const zive = S.zakazky.filter((z) => z.stav !== 'kos');
  $('#p-aktivni').textContent = zive.filter((z) => z.stav === 'aktivni').length;
  $('#p-archiv').textContent = zive.filter((z) => z.stav === 'archiv').length;
  $('#p-vse').textContent = zive.length;
  $('#p-kos').textContent = S.zakazky.filter((z) => z.stav === 'kos').length;
  $$('#zalozky .zalozka').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filtr === UI.filtr)));
  $$('.prepinac [data-pohled]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pohled === UI.pohled)));
  $('#filtr-me').setAttribute('aria-pressed', String(UI.jenMe));
}

function vykresliPlochu() {
  const seznam = vyfiltrovane();
  const plocha = $('#plocha');

  if (!seznam.length) {
    plocha.innerHTML = `
      <div class="prazdno">
        <h3>${UI.hledat ? 'Nic se nenašlo' : UI.jenMe ? 'Na tebe teď nic nečeká' : UI.filtr === 'kos' ? 'Koš je prázdný' : 'Zatím tu nic není'}</h3>
        <p>${UI.hledat ? 'Zkus jiné slovo, hledáme i v poznámkách a názvech videí.' : UI.jenMe ? 'Míč je na druhé straně.' : 'Založ první zakázku a přidej k ní odkazy a videa.'}</p>
        ${!UI.hledat && !UI.jenMe && UI.filtr !== 'kos' ? '<button class="btn-nova" data-akce="nova"><svg class="icon"><use href="#i-plus"/></svg> Nová zakázka</button>' : ''}
      </div>`;
    return;
  }

  if (UI.pohled === 'faze') return vykresliKanban(seznam, plocha);
  if (UI.pohled === 'seznam') return vykresliSeznam(seznam, plocha);

  plocha.innerHTML = `<div class="mrizka">${seznam.map(karta).join('')}</div>`;
}

function tvaryHtml(z) {
  const siroka = (z.videa || []).filter((v) => v.format === '16:9');
  const vysoka = (z.videa || []).filter((v) => v.format === '9:16');
  const trida = (a) => (!a.length ? 'prazdny' : a.every((v) => v.stav === 'odevzdano') ? 'hotovy' : 'rozpracovany');
  return `
    <div class="formaty">
      <div class="fmt fmt-wide ${trida(siroka)}" title="${siroka.length ? siroka.length + '× video 16:9 pro Sreality' : 'Zatím žádné video 16:9'}">
        <b>${siroka.length || '—'}</b><span class="fmt-stitek">SREALITY</span>
      </div>
      <div class="fmt fmt-tall ${trida(vysoka)}" title="${vysoka.length ? vysoka.length + '× reel 9:16' : 'Zatím žádný reel 9:16'}">
        <b>${vysoka.length || '—'}</b><span class="fmt-stitek">REELS</span>
      </div>
      <div class="fmt-meta">
        <span>FOTO <b>${z.pocty?.fotky || 0}</b></span>
        <span>VIZU <b>${z.pocty?.vizualizace || 0}</b></span>
      </div>
    </div>`;
}

function pasHtml(z) {
  const i = fazeIndex(z.faze);
  return `
    <div class="pas">
      <div class="pas-perf"></div>
      <div class="pas-cely">
        ${FAZE.map((f, n) => `<i class="pas-seg ${n < i ? 'hotovy' : n === i ? 'aktivni' + (z.stav === 'aktivni' ? ' pulzuje' : '') : ''}"></i>`).join('')}
      </div>
      <div class="pas-popis"><span>${esc(fazeNazev(z.faze))}</span><span>${i + 1}/5</span></div>
    </div>`;
}

function karta(z) {
  const ukoly = z.ukoly || [];
  const hotove = ukoly.filter((u) => u.hotovo).length;
  const komentaru = komentareZ(z.id).length;
  const dni = dniDo(z.deadline || z.terminNataceni);
  const nalepka = z.deadline ? 'odevzdat' : 'natáčení';
  return `
    <button class="karta ${maNoveZmeny(z) ? 'nove' : ''}" data-akce="otevri" data-id="${esc(z.id)}">
      <div class="karta-hlava">
        <span class="kod">${esc(z.kod)}</span>
        <span class="faze-chip f-${esc(z.faze)}">${esc(fazeNazev(z.faze))}</span>
      </div>
      <div>
        <h3 class="karta-nazev">${esc(z.nazev)}</h3>
        ${z.podnazev ? `<p class="karta-podnazev">${esc(z.podnazev)}</p>` : ''}
      </div>
      ${pasHtml(z)}
      ${tvaryHtml(z)}
      <footer class="karta-pata">
        ${komentaru ? `<span><svg class="icon"><use href="#i-komentar"/></svg>${komentaru}</span>` : ''}
        ${ukoly.length ? `<span><svg class="icon"><use href="#i-ukol"/></svg>${hotove}/${ukoly.length}</span>` : ''}
        ${dni !== null && z.stav === 'aktivni'
          ? `<span class="${dni < 0 ? 'spechá' : dni <= 3 ? 'naklonu' : ''}"><svg class="icon"><use href="#i-kalendar"/></svg>${nalepka} ${denKratce(z.deadline || z.terminNataceni)}</span>`
          : ''}
      </footer>
    </button>`;
}

function vykresliKanban(seznam, plocha) {
  plocha.innerHTML = `<div class="kanban">${FAZE.map((f) => {
    const ve = seznam.filter((z) => z.faze === f.id);
    return `
      <div class="kb-sloupec" data-faze="${f.id}">
        <div class="kb-hlava"><span>${esc(f.nazev)}</span><span>${ve.length}</span></div>
        <div class="kb-telo" data-cil="${f.id}">
          ${ve.map((z) => `
            <button class="kb-karta ${maNoveZmeny(z) ? 'nove' : ''}" draggable="true" data-akce="otevri" data-id="${esc(z.id)}">
              <span class="kod">${esc(z.kod)}</span>
              <h4>${esc(z.nazev)}</h4>
              <div class="radka">
                <span>${(z.videa || []).filter((v) => v.format === '16:9').length}× 16:9</span>
                <span>${(z.videa || []).filter((v) => v.format === '9:16').length}× 9:16</span>
                ${(z.ukoly || []).filter((u) => !u.hotovo).length ? `<span>${(z.ukoly || []).filter((u) => !u.hotovo).length} úkolů</span>` : ''}
              </div>
            </button>`).join('') || '<div style="height:6px"></div>'}
        </div>
      </div>`;
  }).join('')}</div>`;
  zapojTazeni();
}

function vykresliSeznam(seznam, plocha) {
  plocha.innerHTML = `
    <table class="seznam">
      <thead><tr>
        <th>Kód</th><th>Zakázka</th><th>Fáze</th>
        <th class="skryt-mobil">16:9</th><th class="skryt-mobil">9:16</th>
        <th class="skryt-mobil">Foto</th><th class="skryt-mobil">Termín</th><th>Čeká na</th>
      </tr></thead>
      <tbody>${seznam.map((z) => {
        const c = cekaNa(z);
        const kdo = c.studio.length && c.klient.length ? 'obě strany' : c.studio.length ? 'studio' : c.klient.length ? 'Chundela' : '—';
        return `<tr data-akce="otevri" data-id="${esc(z.id)}">
          <td class="mono">${esc(z.kod)}</td>
          <td><div class="s-nazev">${esc(z.nazev)}</div><div class="s-pod">${esc(z.podnazev || '')}</div></td>
          <td><span class="faze-chip f-${esc(z.faze)}">${esc(fazeNazev(z.faze))}</span></td>
          <td class="mono skryt-mobil">${(z.videa || []).filter((v) => v.format === '16:9').length || '—'}</td>
          <td class="mono skryt-mobil">${(z.videa || []).filter((v) => v.format === '9:16').length || '—'}</td>
          <td class="mono skryt-mobil">${z.pocty?.fotky || '—'}</td>
          <td class="mono skryt-mobil">${denKratce(z.deadline || z.terminNataceni) || '—'}</td>
          <td class="mono">${esc(kdo)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
}

/* ---------------------------------------------------------- detail */

function vykresliSuplik() {
  const suplik = $('#suplik');
  const aktivniPrvek = document.activeElement;
  if (suplik.contains(aktivniPrvek) && /INPUT|TEXTAREA/.test(aktivniPrvek.tagName)) return;

  if (UI.otevrena?.typ === 'aktivita') { suplik.innerHTML = htmlAktivita(); return; }

  const z = najdi(UI.otevrena?.id);
  if (!z) { zavriSuplik(); return; }

  const rozepsany = $('#novy-komentar', suplik)?.value || '';
  const posun = $('.suplik-telo', suplik)?.scrollTop || 0;

  suplik.innerHTML = htmlDetail(z);

  if (rozepsany) $('#novy-komentar', suplik).value = rozepsany;
  if (posun) $('.suplik-telo', suplik).scrollTop = posun;
  $$('[data-nahled]', suplik).forEach(nactiNahled);
  $$('textarea', suplik).forEach(dorovnej);
}

/* Textarea roste s textem, ať není potřeba scrollovat uvnitř políčka. */
function dorovnej(pole) {
  pole.style.height = 'auto';
  pole.style.height = Math.min(pole.scrollHeight + 2, 420) + 'px';
}

function htmlDetail(z) {
  const ukoly = z.ukoly || [];
  const komentare = S.aktivita.filter((a) => a.zakazka === z.id).sort((a, b) => a.kdy.localeCompare(b.kdy));

  return `
    <div class="suplik-hlava">
      <div class="sh-radek1">
        <span class="kod">${esc(z.kod)}</span>
        <span class="faze-chip f-${esc(z.faze)}">${esc(fazeNazev(z.faze))}</span>
        <span class="rozpera"></span>
        <button class="ikonbtn" data-akce="zavri" title="Zavřít" aria-label="Zavřít"><svg class="icon"><use href="#i-krizek"/></svg></button>
      </div>
      <h2><input class="vstup" data-pole="nazev" value="${esc(z.nazev)}" style="font:inherit" aria-label="Název zakázky"></h2>
      <input class="vstup" data-pole="podnazev" value="${esc(z.podnazev || '')}" placeholder="Dispozice, lokalita, plocha…" style="color:var(--muted);font-size:13px" aria-label="Popis zakázky">
    </div>

    <div class="suplik-telo">
      ${z.stav === 'kos' ? `
        <div class="blok">
          <p style="color:var(--rust);font-size:13.5px;margin:0 0 12px">Tahle zakázka je v koši. Nikde se nezobrazuje, ale nic se nesmazalo.</p>
          <button class="mini" data-akce="stav" data-stav="aktivni"><svg class="icon"><use href="#i-zpet"/></svg> Vrátit mezi aktivní</button>
        </div>` : ''}

      <div class="blok">
        <div class="blok-hlava"><h3>Fáze</h3></div>
        <div class="faze-volic">
          ${FAZE.map((f) => `<button data-akce="faze" data-faze="${f.id}" aria-pressed="${f.id === z.faze}">${esc(f.nazev)}</button>`).join('')}
        </div>
        <div class="pole" style="margin-top:16px">
          <label for="p-nat">Natáčení</label>
          <input class="vstup" id="p-nat" type="date" data-pole="terminNataceni" value="${esc(z.terminNataceni || '')}">
          <label for="p-dl">Odevzdat do</label>
          <input class="vstup" id="p-dl" type="date" data-pole="deadline" value="${esc(z.deadline || '')}">
          <label for="p-fot">Fotek</label>
          <input class="vstup" id="p-fot" type="number" min="0" data-pole="pocty.fotky" value="${z.pocty?.fotky || 0}">
          <label for="p-viz">Vizualizací</label>
          <input class="vstup" id="p-viz" type="number" min="0" data-pole="pocty.vizualizace" value="${z.pocty?.vizualizace || 0}">
        </div>
      </div>

      <div class="blok">
        <div class="blok-hlava">
          <h3>Odkazy</h3>
          <button class="pridat vpravo" data-akce="pridat-odkaz"><svg class="icon"><use href="#i-plus"/></svg> Vlastní odkaz</button>
        </div>
        <div class="odkazy">
          ${Object.entries(ODKAZY_POPIS).map(([klic, o]) => {
            const url = z.odkazy?.[klic];
            return url
              ? `<a class="odkaz-dlazdice" href="${esc(url)}" target="_blank" rel="noopener">
                   <svg class="icon"><use href="#${o.ikona}"/></svg>
                   <span>${esc(o.popis)}<small>otevřít</small></span>
                   <span class="zmenit" data-akce="odkaz" data-klic="${klic}" role="button" tabindex="0" title="Změnit odkaz"><svg class="icon"><use href="#i-tuzka"/></svg></span>
                 </a>`
              : `<button class="odkaz-dlazdice chybi" data-akce="odkaz" data-klic="${klic}">
                   <svg class="icon"><use href="#${o.ikona}"/></svg>
                   <span>${esc(o.popis)}<small>doplnit</small></span>
                 </button>`;
          }).join('')}
          ${(z.dalsiOdkazy || []).map((o, i) => `
            <a class="odkaz-dlazdice" href="${esc(o.url)}" target="_blank" rel="noopener">
              <svg class="icon"><use href="#i-odkaz"/></svg>
              <span>${esc(o.nazev)}<small>otevřít</small></span>
              <span class="zmenit" data-akce="smazat-odkaz" data-i="${i}" role="button" tabindex="0" title="Odebrat"><svg class="icon"><use href="#i-krizek"/></svg></span>
            </a>`).join('')}
        </div>
      </div>

      <div class="blok">
        <div class="blok-hlava">
          <h3>Videa</h3><span class="pocitadlo">${(z.videa || []).length}</span>
          <button class="pridat vpravo" data-akce="pridat-video"><svg class="icon"><use href="#i-plus"/></svg> Přidat video</button>
        </div>
        ${(z.videa || []).length
          ? `<div class="videa">${z.videa.map(videoKarta).join('')}</div>`
          : `<p class="vl-prazdno">Zatím tu žádné video není.</p>`}
      </div>

      <div class="blok">
        <div class="blok-hlava">
          <h3>Úkoly</h3><span class="pocitadlo">${ukoly.filter((u) => u.hotovo).length}/${ukoly.length}</span>
          <button class="pridat vpravo" data-akce="pridat-ukol"><svg class="icon"><use href="#i-plus"/></svg> Přidat úkol</button>
        </div>
        <div class="ukoly">
          ${ukoly.map((u) => `
            <div class="ukol ${u.hotovo ? 'hotovy' : ''}">
              <button class="zaskrt" data-akce="ukol" data-uid="${esc(u.id)}" role="checkbox" aria-checked="${!!u.hotovo}" aria-label="Hotovo">
                <svg class="icon"><use href="#i-fajfka"/></svg>
              </button>
              <span class="ukol-text">${esc(u.text)}</span>
              <button class="strana-znak ${u.strana === 'klient' ? 'klient' : 'studio'}" data-akce="ukol-strana" data-uid="${esc(u.id)}" title="Přehodit na druhou stranu">
                ${u.strana === 'klient' ? 'Chundela' : 'Studio'}
              </button>
              <button class="smazat" data-akce="ukol-smazat" data-uid="${esc(u.id)}" aria-label="Smazat úkol"><svg class="icon"><use href="#i-krizek"/></svg></button>
            </div>`).join('') || '<p class="vl-prazdno">Žádné úkoly.</p>'}
        </div>
      </div>

      <div class="blok">
        <div class="blok-hlava"><h3>Poznámka</h3></div>
        <textarea class="vstup" data-pole="poznamka" placeholder="Co je u téhle zakázky důležité…">${esc(z.poznamka || '')}</textarea>
      </div>

      <div class="blok">
        <div class="blok-hlava"><h3>Komentáře</h3><span class="pocitadlo">${komentareZ(z.id).length}</span></div>
        <div class="napsat">
          <textarea class="vstup" id="novy-komentar" placeholder="Napsat druhé straně…" rows="2"></textarea>
          <div class="napsat-akce">
            <span class="napoveda">Podepíše se jako ${esc(JA.jmeno)}</span>
            <button class="btn-poslat" data-akce="komentar">Odeslat</button>
          </div>
        </div>
        <div class="vlakno">
          ${komentare.length
            ? komentare.slice().reverse().map(zpravaHtml).join('')
            : '<p class="vl-prazdno">Zatím tu nikdo nic nenapsal.</p>'}
        </div>
      </div>

      <div class="blok" style="padding-bottom:30px">
        ${z.stav !== 'kos' ? `
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${z.stav === 'aktivni'
              ? `<button class="mini" data-akce="stav" data-stav="archiv"><svg class="icon"><use href="#i-slozka"/></svg> Uložit do archivu</button>`
              : `<button class="mini" data-akce="stav" data-stav="aktivni"><svg class="icon"><use href="#i-zpet"/></svg> Vrátit mezi aktivní</button>`}
            <button class="mini zrus" data-akce="stav" data-stav="kos"><svg class="icon"><use href="#i-kos"/></svg> Do koše</button>
          </div>` : ''}
      </div>
    </div>`;
}

function videoKarta(v) {
  const info = vimeoInfo(v.vimeo);
  const sirka = v.format === '9:16' ? 'w916' : 'w169';
  return `
    <div class="video-karta ${sirka}" data-vid="${esc(v.id)}">
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
        <div class="vk-radek1">
          <span class="vk-nazev">${esc(v.nazev)}</span>
          <span class="vk-format">${esc(v.format)}${v.urceni ? ' · ' + esc(v.urceni) : ''}</span>
        </div>
        ${v.poznamka ? `<p class="vk-poznamka">${esc(v.poznamka)}</p>` : ''}
        <div class="vk-akce">
          <span class="stav-znak s-${esc(v.stav)}">${esc(STAVY_VIDEA[v.stav] || v.stav)}</span>
          ${v.stav === 'ke_schvaleni' ? `
            <button class="mini ano" data-akce="video-stav" data-vid="${esc(v.id)}" data-stav="odevzdano"><svg class="icon"><use href="#i-fajfka"/></svg> Schválit</button>
            <button class="mini ne" data-akce="video-stav" data-vid="${esc(v.id)}" data-stav="uprava"><svg class="icon"><use href="#i-tuzka"/></svg> Chci úpravy</button>` : ''}
          ${v.stav === 'vyroba' ? `<button class="mini" data-akce="video-stav" data-vid="${esc(v.id)}" data-stav="ke_schvaleni">Poslat ke schválení</button>` : ''}
          ${v.stav === 'uprava' ? `<button class="mini" data-akce="video-stav" data-vid="${esc(v.id)}" data-stav="ke_schvaleni">Hotovo, znovu ke schválení</button>` : ''}
          ${v.stav === 'odevzdano' ? `<button class="mini" data-akce="video-stav" data-vid="${esc(v.id)}" data-stav="uprava">Znovu otevřít</button>` : ''}
          <button class="mini" data-akce="video-upravit" data-vid="${esc(v.id)}"><svg class="icon"><use href="#i-tuzka"/></svg> Upravit</button>
          ${info ? `<a class="mini" href="${esc(info.verejny)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-odkaz"/></svg> Vimeo</a>` : ''}
          <button class="mini zrus" data-akce="video-smazat" data-vid="${esc(v.id)}" aria-label="Smazat video"><svg class="icon"><use href="#i-kos"/></svg></button>
        </div>
      </div>
    </div>`;
}

function zpravaHtml(a) {
  const system = a.typ !== 'komentar';
  return `
    <div class="zprava ${system ? 'system' : ''}">
      <span class="avatar ${a.role === 'klient' ? 'klient' : ''}">${esc(iniciely(a.kdo))}</span>
      <div class="zprava-telo">
        <div class="zprava-hlava">
          <span class="zprava-kdo">${esc(a.kdo)}</span>
          <span class="zprava-kdy" title="${esc(dtPlne.format(new Date(a.kdy)))}">${esc(kdyKratce(a.kdy))}</span>
        </div>
        <div class="zprava-text">${esc(a.text)}</div>
      </div>
    </div>`;
}

function htmlAktivita() {
  const polozky = S.aktivita.slice().sort((a, b) => b.kdy.localeCompare(a.kdy)).slice(0, 120);
  return `
    <div class="panel-hlava">
      <h2>Poslední změny</h2>
      <span class="rozpera" style="flex:1"></span>
      <button class="ikonbtn" data-akce="zavri" aria-label="Zavřít"><svg class="icon"><use href="#i-krizek"/></svg></button>
    </div>
    <div class="suplik-telo">
      ${polozky.map((a) => {
        const z = najdi(a.zakazka);
        return `
          <div class="aktivita-radek">
            <span class="avatar ${a.role === 'klient' ? 'klient' : ''}">${esc(iniciely(a.kdo))}</span>
            <div class="zprava-telo">
              <div class="zprava-hlava">
                <span class="zprava-kdo">${esc(a.kdo)}</span>
                <span class="zprava-kdy">${esc(kdyKratce(a.kdy))}</span>
                ${z ? `<button class="aktivita-zak" data-akce="otevri" data-id="${esc(z.id)}">${esc(z.kod)} ${esc(z.nazev)}</button>` : ''}
              </div>
              <div class="zprava-text" style="${a.typ === 'komentar' ? '' : 'color:var(--muted);font-size:12.5px'}">${esc(a.text)}</div>
            </div>
          </div>`;
      }).join('') || '<p class="vl-prazdno" style="padding:20px 0">Zatím žádné změny.</p>'}
    </div>`;
}

const iniciely = (jmeno) => String(jmeno || '?').split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase();

async function nactiNahled(tlacitko) {
  const id = tlacitko.dataset.nahled;
  const hash = tlacitko.dataset.hash || null;
  try {
    const url = await vimeoNahled({ id, hash, verejny: `https://vimeo.com/${id}${hash ? '/' + hash : ''}` });
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    tlacitko.parentElement?.prepend(img);
  } catch { /* náhled není povinný */ }
}

/* ---------------------------------------------------------- šuplík */

function otevriZakazku(id) {
  UI.otevrena = { typ: 'zakazka', id };
  videno[id] = nyni();
  ulozVideno();
  $('#suplik').classList.add('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'false');
  $('#zaves').classList.add('otevreno');
  document.body.style.overflow = 'hidden';
  vykresliSuplik();
  $('#suplik').scrollTop = 0;
  vykresliPlochu();
}

function otevriAktivitu() {
  UI.otevrena = { typ: 'aktivita' };
  $('#suplik').classList.add('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'false');
  $('#zaves').classList.add('otevreno');
  document.body.style.overflow = 'hidden';
  vykresliSuplik();
}

function zavriSuplik() {
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
  if (p.typ === 'textarea') {
    vstup = `<textarea id="${id}" name="${p.klic}" placeholder="${esc(p.placeholder || '')}">${esc(p.hodnota || '')}</textarea>`;
  } else if (p.typ === 'select') {
    vstup = `<select id="${id}" name="${p.klic}">${p.volby.map((v) => `<option value="${esc(v.id)}" ${v.id === p.hodnota ? 'selected' : ''}>${esc(v.nazev)}</option>`).join('')}</select>`;
  } else if (p.typ === 'prepinac') {
    vstup = `<div class="prepinac-dva" data-prepinac="${p.klic}">
      ${p.volby.map((v) => `<button type="button" data-hodnota="${esc(v.id)}" aria-pressed="${v.id === p.hodnota}">${esc(v.nazev)}</button>`).join('')}
      <input type="hidden" name="${p.klic}" value="${esc(p.hodnota)}">
    </div>`;
  } else {
    vstup = `<input id="${id}" name="${p.klic}" type="${p.typ || 'text'}" value="${esc(p.hodnota || '')}" placeholder="${esc(p.placeholder || '')}" ${p.autofocus ? 'autofocus' : ''}>`;
  }
  return `<div class="dlg-pole">
    <label for="${id}">${esc(p.label)}</label>
    ${vstup}
    ${p.napoveda ? `<span class="napoveda">${esc(p.napoveda)}</span>` : ''}
  </div>`;
}

function dialog({ titulek, popis, pole = [], okText = 'Uložit', nebezpeci = false }) {
  const dlg = $('#dlg');
  $('#dlg-titulek').textContent = titulek;
  $('#dlg-popis').textContent = popis || '';
  $('#dlg-popis').classList.toggle('skryto', !popis);
  $('#dlg-telo').innerHTML = pole.map(dialogPole).join('');
  $('#dlg-ok').textContent = okText;
  $('#dlg-ok').classList.toggle('nebezpeci', nebezpeci);

  $$('[data-prepinac]', dlg).forEach((skup) => {
    skup.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-hodnota]');
      if (!b) return;
      $$('button', skup).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('input', skup).value = b.dataset.hodnota;
    });
  });

  dlg.showModal();
  setTimeout(() => $('#dlg-telo input, #dlg-telo textarea, #dlg-telo select')?.focus(), 40);

  return new Promise((hotovo) => {
    const odeslat = (e) => {
      e.preventDefault();
      const fd = new FormData($('#dlg-form'));
      const out = {};
      for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v.trim() : v;
      uklid();
      dlg.close();
      hotovo(out);
    };
    const zrusit = () => { uklid(); dlg.close(); hotovo(null); };
    const zavreno = () => { uklid(); hotovo(null); };
    function uklid() {
      $('#dlg-form').removeEventListener('submit', odeslat);
      $('#dlg-zrusit').removeEventListener('click', zrusit);
      dlg.removeEventListener('cancel', zavreno);
    }
    $('#dlg-form').addEventListener('submit', odeslat);
    $('#dlg-zrusit').addEventListener('click', zrusit);
    dlg.addEventListener('cancel', zavreno);
  });
}

async function potvrd({ titulek, popis, okText = 'Potvrdit', nebezpeci = true }) {
  return (await dialog({ titulek, popis, pole: [], okText, nebezpeci })) !== null;
}

/* ---------------------------------------------------------- akce */

async function akceNaZakazce(akce, prvek, z) {
  const cil = prvek.dataset;

  if (akce === 'faze') {
    if (cil.faze === z.faze) return;
    await uloz(`${z.kod} — fáze: ${fazeNazev(cil.faze)}`,
      upravZak(z.id, (x) => { x.faze = cil.faze; if (cil.faze === 'hotovo') x.stav = 'archiv'; }),
      { zakazka: z.id, typ: 'zmena', text: `posunul fázi na „${fazeNazev(cil.faze)}"` });
    return;
  }

  if (akce === 'stav') {
    const popisy = { aktivni: 'vrátil mezi aktivní', archiv: 'uložil do archivu', kos: 'přesunul do koše' };
    if (cil.stav === 'kos' && !await potvrd({
      titulek: 'Do koše?',
      popis: `„${z.nazev}" zmizí z nástěnky, ale zůstane v koši a jde ji odtamtud vrátit.`,
      okText: 'Přesunout do koše',
    })) return;
    await uloz(`${z.kod} — ${popisy[cil.stav]}`,
      upravZak(z.id, (x) => { x.stav = cil.stav; }),
      { zakazka: z.id, typ: 'zmena', text: popisy[cil.stav] });
    if (cil.stav === 'kos') zavriSuplik();
    return;
  }

  if (akce === 'odkaz') {
    const o = ODKAZY_POPIS[cil.klic];
    const v = await dialog({
      titulek: o.popis,
      popis: 'Vlož odkaz na Google Drive, Úschovnu, Zoner, galerii — cokoliv, co se dá otevřít v prohlížeči.',
      pole: [{ klic: 'url', label: 'Odkaz', typ: 'url', hodnota: z.odkazy?.[cil.klic] || '', placeholder: 'https://…', autofocus: true }],
    });
    if (!v) return;
    await uloz(`${z.kod} — odkaz ${o.popis}`,
      upravZak(z.id, (x) => { x.odkazy = x.odkazy || {}; x.odkazy[cil.klic] = v.url; }),
      { zakazka: z.id, typ: 'zmena', text: v.url ? `doplnil odkaz — ${o.popis}` : `odebral odkaz — ${o.popis}` });
    return;
  }

  if (akce === 'pridat-odkaz') {
    const v = await dialog({
      titulek: 'Vlastní odkaz',
      pole: [
        { klic: 'nazev', label: 'Jak se odkaz jmenuje', hodnota: '', placeholder: 'Např. Půdorysy', autofocus: true },
        { klic: 'url', label: 'Odkaz', typ: 'url', hodnota: '', placeholder: 'https://…' },
      ],
    });
    if (!v || !v.url) return;
    await uloz(`${z.kod} — přidán odkaz ${v.nazev}`,
      upravZak(z.id, (x) => { x.dalsiOdkazy = x.dalsiOdkazy || []; x.dalsiOdkazy.push({ nazev: v.nazev || 'Odkaz', url: v.url }); }),
      { zakazka: z.id, typ: 'zmena', text: `přidal odkaz — ${v.nazev || 'Odkaz'}` });
    return;
  }

  if (akce === 'smazat-odkaz') {
    const i = Number(cil.i);
    const jmeno = z.dalsiOdkazy?.[i]?.nazev || 'odkaz';
    await uloz(`${z.kod} — odebrán odkaz`,
      upravZak(z.id, (x) => { x.dalsiOdkazy.splice(i, 1); }),
      { zakazka: z.id, typ: 'zmena', text: `odebral odkaz — ${jmeno}` });
    return;
  }

  if (akce === 'pridat-video' || akce === 'video-upravit') {
    const v = akce === 'video-upravit' ? (z.videa || []).find((x) => x.id === cil.vid) : null;
    const data = await dialog({
      titulek: v ? 'Upravit video' : 'Nové video',
      pole: [
        { klic: 'nazev', label: 'Název', hodnota: v?.nazev || '', placeholder: 'Např. Prohlídka domu', autofocus: true },
        { klic: 'format', label: 'Formát', typ: 'prepinac', hodnota: v?.format || '16:9', volby: [{ id: '16:9', nazev: '16:9 na šířku' }, { id: '9:16', nazev: '9:16 na výšku' }] },
        { klic: 'urceni', label: 'Kam to jde', hodnota: v?.urceni || 'Sreality', placeholder: 'Sreality, Reels, web…' },
        { klic: 'vimeo', label: 'Odkaz na Vimeo', typ: 'text', hodnota: v?.vimeo || '', placeholder: 'https://vimeo.com/123456789', napoveda: 'Funguje veřejný i skrytý odkaz včetně hashe (vimeo.com/123456789/abc123).' },
        { klic: 'poznamka', label: 'Poznámka', typ: 'textarea', hodnota: v?.poznamka || '', placeholder: 'Délka, styl, co se v něm mění…' },
      ],
    });
    if (!data || !data.nazev) return;
    if (data.vimeo && !vimeoInfo(data.vimeo)) { hlaska('Tenhle odkaz nevypadá jako Vimeo. Zkontroluj ho.', 'chyba'); return; }

    if (v) {
      await uloz(`${z.kod} — upraveno video ${data.nazev}`,
        upravZak(z.id, (x) => { Object.assign(x.videa.find((y) => y.id === v.id), data); }),
        { zakazka: z.id, cil: v.id, typ: 'zmena', text: `upravil video „${data.nazev}"` });
    } else {
      await uloz(`${z.kod} — přidáno video ${data.nazev}`,
        upravZak(z.id, (x) => { x.videa = x.videa || []; x.videa.push({ id: uid('v'), stav: 'vyroba', ...data }); }),
        { zakazka: z.id, typ: 'zmena', text: `přidal video „${data.nazev}" (${data.format})` });
    }
    return;
  }

  if (akce === 'video-smazat') {
    const v = (z.videa || []).find((x) => x.id === cil.vid);
    if (!v) return;
    if (!await potvrd({
      titulek: 'Smazat video?',
      popis: `„${v.nazev}" zmizí z kokpitu. Soubor na Vimeu zůstane, kde je.`,
      okText: 'Smazat',
    })) return;
    await uloz(`${z.kod} — smazáno video ${v.nazev}`,
      upravZak(z.id, (x) => { x.videa = x.videa.filter((y) => y.id !== v.id); }),
      { zakazka: z.id, typ: 'zmena', text: `smazal video „${v.nazev}"` });
    return;
  }

  if (akce === 'video-stav') {
    const v = (z.videa || []).find((x) => x.id === cil.vid);
    if (!v) return;
    let poznamka = '';
    if (cil.stav === 'uprava') {
      const d = await dialog({
        titulek: 'Co upravit?',
        popis: 'Napiš co nejkonkrétněji — čas ve videu, záběr, text.',
        pole: [{ klic: 'text', label: 'Připomínky', typ: 'textarea', hodnota: '', placeholder: 'Např. 0:14 — ubrat hudbu, 0:32 — vyměnit záběr kuchyně', autofocus: true }],
      });
      if (!d) return;
      poznamka = d.text;
    }
    const popisy = {
      ke_schvaleni: `poslal ke schválení video „${v.nazev}"`,
      odevzdano: `schválil video „${v.nazev}"`,
      uprava: `poslal video „${v.nazev}" k úpravám`,
      vyroba: `vrátil video „${v.nazev}" do výroby`,
    };
    /* Video, které čeká na někoho, nesmí uváznout v archivu —
       zakázka se vrátí mezi aktivní, ať to vyskočí ve volacím listu. */
    const probrat = cil.stav === 'uprava' || cil.stav === 'ke_schvaleni';
    const oziva = probrat && z.stav === 'archiv';

    await uloz(`${z.kod} — ${v.nazev}: ${STAVY_VIDEA[cil.stav]}`,
      upravZak(z.id, (x) => {
        x.videa.find((y) => y.id === v.id).stav = cil.stav;
        if (probrat && x.stav === 'archiv') x.stav = 'aktivni';
        if (probrat && x.faze === 'hotovo') x.faze = cil.stav === 'uprava' ? 'strih' : 'schvaleni';
      }),
      { zakazka: z.id, cil: v.id, typ: cil.stav === 'odevzdano' ? 'schvaleni' : 'zmena', text: popisy[cil.stav] + (poznamka ? ':\n' + poznamka : '') });

    if (oziva) hlaska('Zakázka se vrátila mezi aktivní.', 'uspech');
    else if (cil.stav === 'odevzdano') hlaska('Schváleno. Studio to uvidí ve volacím listu.', 'uspech');
    return;
  }

  if (akce === 'pridat-ukol') {
    const v = await dialog({
      titulek: 'Nový úkol',
      pole: [
        { klic: 'text', label: 'Co je potřeba', hodnota: '', placeholder: 'Např. Dodat půdorysy', autofocus: true },
        { klic: 'strana', label: 'Kdo to udělá', typ: 'prepinac', hodnota: mojeStrana(), volby: [{ id: 'studio', nazev: 'Studio' }, { id: 'klient', nazev: 'Chundela' }] },
      ],
    });
    if (!v || !v.text) return;
    await uloz(`${z.kod} — nový úkol`,
      upravZak(z.id, (x) => { x.ukoly = x.ukoly || []; x.ukoly.push({ id: uid('u'), text: v.text, strana: v.strana, hotovo: false, termin: '' }); }),
      { zakazka: z.id, typ: 'zmena', text: `přidal úkol pro ${v.strana === 'klient' ? 'Chundelu' : 'studio'}: ${v.text}` });
    return;
  }

  if (akce === 'ukol') {
    const u = (z.ukoly || []).find((x) => x.id === cil.uid);
    if (!u) return;
    const nove = !u.hotovo;
    await uloz(`${z.kod} — úkol ${nove ? 'hotov' : 'znovu otevřen'}`,
      upravZak(z.id, (x) => { x.ukoly.find((y) => y.id === u.id).hotovo = nove; }),
      { zakazka: z.id, typ: 'zmena', text: `${nove ? 'odškrtl' : 'znovu otevřel'} úkol: ${u.text}` });
    return;
  }

  if (akce === 'ukol-strana') {
    const u = (z.ukoly || []).find((x) => x.id === cil.uid);
    if (!u) return;
    const nova = u.strana === 'klient' ? 'studio' : 'klient';
    await uloz(`${z.kod} — úkol přehozen`,
      upravZak(z.id, (x) => { x.ukoly.find((y) => y.id === u.id).strana = nova; }),
      { zakazka: z.id, typ: 'zmena', text: `přehodil úkol na ${nova === 'klient' ? 'Chundelu' : 'studio'}: ${u.text}` });
    return;
  }

  if (akce === 'ukol-smazat') {
    const u = (z.ukoly || []).find((x) => x.id === cil.uid);
    if (!u) return;
    await uloz(`${z.kod} — smazán úkol`,
      upravZak(z.id, (x) => { x.ukoly = x.ukoly.filter((y) => y.id !== u.id); }),
      { zakazka: z.id, typ: 'zmena', text: `smazal úkol: ${u.text}` });
    return;
  }

  if (akce === 'komentar') {
    const pole = $('#novy-komentar');
    const text = pole.value.trim();
    if (!text) return;
    pole.value = '';
    const ok = await uloz(`${z.kod} — komentář`, null, { zakazka: z.id, typ: 'komentar', text });
    if (!ok) pole.value = text;
    return;
  }

  if (akce === 'prehrat') {
    const v = (z.videa || []).find((x) => x.id === cil.vid);
    const info = vimeoInfo(v?.vimeo);
    if (!info) return;
    const ramecek = prvek.closest('.vk-ramecek');
    ramecek.innerHTML = `<iframe src="${esc(info.embed)}&autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(v.nazev)}"></iframe>`;
    return;
  }
}

async function novaZakazka() {
  const v = await dialog({
    titulek: 'Nová zakázka',
    pole: [
      { klic: 'nazev', label: 'Název', hodnota: '', placeholder: 'Např. Vinohrady — Bělehradská', autofocus: true },
      { klic: 'podnazev', label: 'Popis', hodnota: '', placeholder: 'Např. Byt 3+kk · 92 m² · Praha 2' },
      { klic: 'faze', label: 'Fáze', typ: 'select', hodnota: 'poptavka', volby: FAZE },
      { klic: 'terminNataceni', label: 'Termín natáčení', typ: 'date', hodnota: '' },
    ],
    okText: 'Založit',
  });
  if (!v || !v.nazev) return;

  const rok = String(new Date().getFullYear()).slice(2);
  const cislo = S.zakazky.filter((z) => (z.kod || '').startsWith(rok + '-')).length + 1;
  const nova = {
    id: uid('z'),
    kod: `${rok}-${String(cislo).padStart(2, '0')}`,
    nazev: v.nazev,
    podnazev: v.podnazev,
    stav: 'aktivni',
    faze: v.faze,
    terminNataceni: v.terminNataceni,
    deadline: '',
    odkazy: { inzerat: '', fotky: '', vizualizace: '', podklady: '' },
    dalsiOdkazy: [],
    pocty: { fotky: 0, vizualizace: 0 },
    videa: [],
    ukoly: [],
    poznamka: '',
    vytvoreno: nyni(),
    aktualizovano: nyni(),
  };
  const ok = await uloz(`Nová zakázka ${nova.kod} — ${nova.nazev}`,
    (d) => { d.zakazky.unshift(nova); },
    { zakazka: nova.id, typ: 'zmena', text: `založil zakázku „${nova.nazev}"` });
  if (ok) { UI.filtr = 'aktivni'; otevriZakazku(nova.id); }
}

/* ---------------------------------------------------------- editace polí */

async function ulozPole(prvek) {
  const z = najdi(UI.otevrena?.id);
  if (!z) return;
  const cesta = prvek.dataset.pole;
  const nova = prvek.type === 'number' ? Number(prvek.value) || 0 : prvek.value;
  const stara = cesta.split('.').reduce((o, k) => o?.[k], z);
  if (String(stara ?? '') === String(nova)) return;

  const nazvy = {
    nazev: 'název', podnazev: 'popis', poznamka: 'poznámku',
    terminNataceni: 'termín natáčení', deadline: 'termín odevzdání',
    'pocty.fotky': 'počet fotek', 'pocty.vizualizace': 'počet vizualizací',
  };
  await uloz(`${z.kod} — ${nazvy[cesta] || cesta}`,
    upravZak(z.id, (x) => {
      const kusy = cesta.split('.');
      let cil = x;
      while (kusy.length > 1) { const k = kusy.shift(); cil[k] = cil[k] || {}; cil = cil[k]; }
      cil[kusy[0]] = nova;
    }),
    { zakazka: z.id, typ: 'zmena', text: `změnil ${nazvy[cesta] || cesta}` });
}

/* ---------------------------------------------------------- tažení */

let tazena = null;

function zapojTazeni() {
  $$('.kb-karta').forEach((k) => {
    k.addEventListener('dragstart', (e) => {
      tazena = k.dataset.id;
      k.classList.add('tahne');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tazena);
    });
    k.addEventListener('dragend', () => { k.classList.remove('tahne'); tazena = null; });
  });

  $$('.kb-telo').forEach((t) => {
    t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('cil'); });
    t.addEventListener('dragleave', () => t.classList.remove('cil'));
    t.addEventListener('drop', async (e) => {
      e.preventDefault();
      t.classList.remove('cil');
      const id = tazena || e.dataTransfer.getData('text/plain');
      const z = najdi(id);
      const faze = t.dataset.cil;
      if (!z || z.faze === faze) return;
      await uloz(`${z.kod} — fáze: ${fazeNazev(faze)}`,
        upravZak(z.id, (x) => { x.faze = faze; if (faze === 'hotovo') x.stav = 'archiv'; }),
        { zakazka: z.id, typ: 'zmena', text: `posunul fázi na „${fazeNazev(faze)}"` });
    });
  });
}

/* ---------------------------------------------------------- načtení a synchronizace */

async function nactiVse({ podminene = false } = {}) {
  const [z, a] = await Promise.all([
    GH.nacti(SOUBOR_ZAKAZKY, { podminene }),
    GH.nacti(SOUBOR_AKTIVITA, { podminene }),
  ]);
  let zmena = false;
  if (z.zmeneno) { S.zakazky = z.data.zakazky || []; zmena = true; }
  if (a.zmeneno) { S.aktivita = a.data.polozky || []; zmena = true; }
  if (zmena) {
    localStorage.setItem('kokpit.cache', JSON.stringify({ zakazky: S.zakazky, aktivita: S.aktivita }));
    vykresli();
  }
  return zmena;
}

let synchronizuje = false;

async function synchronizuj(hlasitost = 'ticho') {
  if (synchronizuje || UI.ukladam) return;
  synchronizuje = true;
  if (hlasitost === 'nahlas') $('#btn-obnovit').classList.add('tocise');
  try {
    const zmena = await nactiVse({ podminene: true });
    if (hlasitost === 'nahlas') hlaska(zmena ? 'Načteno znovu.' : 'Máš nejnovější verzi.', 'uspech');
  } catch (e) {
    if (hlasitost === 'nahlas') hlaska(e.message, 'chyba');
  } finally {
    synchronizuje = false;
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

function nastavJa(role, jmeno) {
  JA.role = role;
  JA.jmeno = jmeno;
  $('#me-jmeno').textContent = jmeno;
  $('#me-avatar').textContent = iniciely(jmeno);
  $('#me-avatar').classList.toggle('klient', role === 'klient');
}

async function spust(token, role, jmeno) {
  GH.token = token;
  nastavJa(role, jmeno);
  $('#zamek').classList.add('skryto');
  $('#app').classList.remove('skryto');

  const cache = localStorage.getItem('kokpit.cache');
  if (cache) {
    try {
      const c = JSON.parse(cache);
      S.zakazky = c.zakazky || [];
      S.aktivita = c.aktivita || [];
      vykresli();
    } catch {}
  }

  try {
    await nactiVse();
    // první spuštění: ať se všechno netváří jako nepřečtené
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

/* ------------------------------- posluchači ------------------------------- */

$('#zamek-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#zamek-btn');
  const chyba = $('#zamek-chyba');
  chyba.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Odemykám…';
  try {
    const heslo = $('#zamek-heslo').value;
    const vysledek = await odemkni(heslo);
    if (!vysledek) {
      chyba.textContent = 'Tohle heslo nesedí.';
      $('#zamek-heslo').select();
      return;
    }
    let jmeno = localStorage.getItem('kokpit.jmeno');
    if (!jmeno) {
      const v = await dialog({
        titulek: 'Jak se podepisovat?',
        popis: 'Tohle jméno uvidí druhá strana u každého komentáře a u každé změny.',
        pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: vysledek.role === 'klient' ? 'Honza' : 'Franta', autofocus: true }],
        okText: 'Pokračovat',
      });
      if (!v?.jmeno) return;
      jmeno = v.jmeno.trim().slice(0, 40);
      localStorage.setItem('kokpit.jmeno', jmeno);
    }
    localStorage.setItem('kokpit.sez', JSON.stringify({ token: vysledek.token, role: vysledek.role }));
    await spust(vysledek.token, vysledek.role, jmeno);
  } catch (err) {
    chyba.textContent = 'Něco se pokazilo: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Otevřít kokpit';
  }
});

document.addEventListener('click', async (e) => {
  const prvek = e.target.closest('[data-akce]');
  if (prvek) {
    const akce = prvek.dataset.akce;
    if (akce === 'zavri') return zavriSuplik();
    if (akce === 'nova') return novaZakazka();
    if (akce === 'otevri') { e.preventDefault(); return otevriZakazku(prvek.dataset.id); }
    const z = najdi(UI.otevrena?.id);
    if (z) { e.preventDefault(); return akceNaZakazce(akce, prvek, z); }
    return;
  }
  if (e.target.closest('#zaves')) zavriSuplik();
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-pole]')) ulozPole(e.target);
});

document.addEventListener('input', (e) => {
  if (e.target.matches('#suplik textarea')) dorovnej(e.target);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && UI.otevrena && !$('#dlg').open) zavriSuplik();
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); $('#hledat').focus(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.id === 'novy-komentar') {
    const z = najdi(UI.otevrena?.id);
    if (z) akceNaZakazce('komentar', e.target, z);
  }
});

$('#hledat').addEventListener('input', (e) => { UI.hledat = e.target.value; vykresliPlochu(); });

$('#zalozky').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtr]');
  if (!b) return;
  UI.filtr = b.dataset.filtr;
  localStorage.setItem('kokpit.filtr', UI.filtr);
  vykresliOvladani();
  vykresliPlochu();
});

$('.prepinac').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pohled]');
  if (!b) return;
  UI.pohled = b.dataset.pohled;
  localStorage.setItem('kokpit.pohled', UI.pohled);
  vykresliOvladani();
  vykresliPlochu();
});

$('#filtr-me').addEventListener('click', () => { UI.jenMe = !UI.jenMe; vykresliOvladani(); vykresliPlochu(); });
$('#btn-nova').addEventListener('click', novaZakazka);
$('#btn-obnovit').addEventListener('click', () => synchronizuj('nahlas'));
$('#btn-aktivita').addEventListener('click', otevriAktivitu);

$('#btn-role').addEventListener('click', async () => {
  const v = await dialog({
    titulek: 'Podpis a přihlášení',
    popis: `Jsi přihlášený${JA.role === 'klient' ? ' za Chundela Reality' : ' za studio'}. Pod tímhle jménem se ukládá všechno, co tu uděláš.`,
    pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: JA.jmeno, autofocus: true }],
    okText: 'Uložit jméno',
  });
  if (v?.jmeno) {
    localStorage.setItem('kokpit.jmeno', v.jmeno.trim());
    nastavJa(JA.role, v.jmeno.trim());
    vykresli();
  }
});

/* obnovení sezení */
(async () => {
  if (!window.CFG || !CFG.blobs || !Object.values(CFG.blobs).some(Boolean)) {
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
