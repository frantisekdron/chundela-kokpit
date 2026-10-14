/* ============================================================
   Zakázky — sdílená nástěnka klienta a studia
   (kdo s kým, barvy a jména jsou v config.js a znacka.css)

   Nahoře poznámky a úkoly, pod nimi zakázky v pořadí, jaké si
   kdo přetáhne. Zakázka = popis, adresa, TOP přednosti, odkazy, půdorysy, nápady na scénář,
   videa a bannery,
   každá položka může mít svůj komentář. Obě strany můžou všechno.

   Data leží v privátním repu na GitHubu, každá změna je commit,
   takže je vidět kdo a kdy, a nic nejde nenávratně ztratit.
   ============================================================ */

const $  = (s, k = document) => k.querySelector(s);
const $$ = (s, k = document) => [...k.querySelectorAll(s)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Kdo s kým — jména jsou v config.js, ať je tenhle soubor stejný pro všechny kokpity. */
const CFG = window.CFG || {};
const KLIENT = CFG.klient || 'Klient';
const STUDIO = CFG.studio || 'Studio';

/* Kokpity všech klientů běží na stejné adrese (…github.io), takže sdílejí
   localStorage. Každý si proto drží svoje klíče pod jménem svého datového repa,
   jinak by se navzájem odhlašovaly a ukazovaly si cizí data z mezipaměti.
   (Náhledy z Vimea pod „kokpit.thumb.*“ jsou veřejné a sdílet se smí.) */
const ulozKlic = (k) => `kokpit.${CFG.repo || 'kokpit'}.${k}`;

/* localStorage umí vyhodit výjimku (Safari s blokovanými cookies, prohlížeče
   uvnitř aplikací, plná kvóta). Kokpit pak jen nic nepamatuje, ale funguje. */
const pamet = {
  cti: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  pis: (k, v) => { try { localStorage.setItem(k, v); } catch { /* zakázané nebo plné */ } },
  smaz: (k) => { try { localStorage.removeItem(k); } catch { /* zakázané */ } },
};

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
const nyni = () => new Date().toISOString();
const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);

const dtPlne = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dtKratce = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric' });
const dtDen = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });

/* Datum natáčení je uložené jako 2026-07-30, ukazuje se jako 30. 7. 2026. */
function denCesky(datum) {
  if (!datum) return '';
  const d = new Date(datum + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? datum : dtDen.format(d);
}

function kdyKratce(iso) {
  const d = new Date(iso);
  const min = (Date.now() - d.getTime()) / 60000;
  if (min < 1) return 'právě teď';
  if (min < 60) return `před ${Math.floor(min)} min`;
  if (min < 1440) return `před ${Math.floor(min / 60)} h`;
  if (min < 2880) return 'včera';
  if (min < 10080) return `před ${Math.floor(min / 1440)} dny`;
  return dtKratce.format(d);  /* cs-CZ už tečku za měsícem dává sám */
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
  const ulozeny = pamet.cti(klic);
  if (ulozeny) { nahledy.set(info.id, ulozeny); return ulozeny; }
  const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(info.verejny)}&width=800`);
  if (!r.ok) throw new Error('bez náhledu');
  const { thumbnail_url } = await r.json();
  if (!thumbnail_url) throw new Error('bez náhledu');
  pamet.pis(klic, thumbnail_url);
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

/* Otisk klíčů z config.js. Když se klíč vymění, uložené přihlášení
   v prohlížeči přestane platit a kokpit si řekne o heslo znovu —
   jinak by lidem donekonečna zůstal viset ten starý, už neplatný. */
const otiskKlicu = () => Object.values(CFG.blobs || {}).map((b) => String(b || '').slice(-32)).join('|');

/* Dřív existoval jen kokpit Chundely a klíče v prohlížeči neměly jméno repa.
   Převezmou se jen tam, kde k nim sedí otisk klíče — tedy u téhož kokpitu. */
(() => {
  try {
    const stara = JSON.parse(pamet.cti('kokpit.sez') || 'null');
    if (!stara || stara.otisk !== otiskKlicu()) return;
    for (const k of ['sez', 'jmeno', 'filtr', 'cache']) {
      const v = pamet.cti('kokpit.' + k);
      if (v !== null && pamet.cti(ulozKlic(k)) === null) pamet.pis(ulozKlic(k), v);
      pamet.smaz('kokpit.' + k);
    }
  } catch { /* poškozená stará data — přihlásí se znovu */ }
})();

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
const SOUBOR_UKOLY = 'data/aktivita.json';  /* poznámky a úkoly */
const SOUBOR_CENIK = 'data/cenik.json';

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

  /* GitHub u přístupových klíčů schválně nerozlišuje „nemáš právo"
     a „neexistuje" — obojí vrátí 404. Doptáme se tedy na repozitář
     a řekneme rovnou, co je špatně a kde to opravit. */
  async chyba(r) {
    if (r.status === 401) return 'Přístupový klíč vypršel nebo byl zrušen. Vyrob nový přes nastav_pristup.py.';
    if (r.status === 403 || r.status === 404) {
      const potize = await GH.procNejde();
      if (potize) return potize;
    }
    let detail = '';
    try { detail = (await r.json()).message || ''; } catch {}
    return `GitHub vrátil chybu ${r.status}. ${detail}`;
  },

  /* Chyba si nese stavový kód, ať se na ni dá reagovat bez hádání z textu. */
  async selhalo(r) {
    const e = new Error(await GH.chyba(r));
    e.stav = r.status;
    return e;
  },

  async procNejde() {
    try {
      const r = await GH.volej(`/repos/${CFG.owner}/${CFG.repo}`);
      if (r.status === 404) {
        return `Přístupový klíč nevidí repozitář ${CFG.owner}/${CFG.repo}. V nastavení klíče na GitHubu musí být pod Repository access vybraný právě tenhle repozitář.`;
      }
      if (!r.ok) return null;
      const repo = await r.json();
      if (repo.permissions && !repo.permissions.push) {
        return 'Přístupový klíč umí data jen číst, ne zapisovat. Na GitHubu v nastavení klíče přepni Repository permissions → Contents na „Read and write".';
      }
      return null;
    } catch { return null; }
  },

  async nacti(soubor, { podminene = false } = {}) {
    const hlavicky = {};
    if (podminene && GH.etag[soubor]) hlavicky['If-None-Match'] = GH.etag[soubor];
    const r = await GH.volej(`${GH.cesta(soubor)}?ref=${CFG.branch}`, { headers: hlavicky });
    if (r.status === 304) return { zmeneno: false };
    if (!r.ok) throw await GH.selhalo(r);
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

      const telo = { message: zpravaCommitu(zprava), content: textNaB64(JSON.stringify(kopie, null, 2)), branch: CFG.branch, sha: ulozene.sha };
      const r = await GH.volej(GH.cesta(soubor), { method: 'PUT', body: JSON.stringify(telo) });

      if (r.ok) {
        const j = await r.json();
        delete GH.etag[soubor];
        GH.mezipamet[soubor] = { data: kopie, sha: j.content.sha };
        return kopie;
      }
      if (r.status !== 409 && r.status !== 422) throw await GH.selhalo(r);
      await pauza(250 * (pokus + 1));
    }
    throw new Error('Nepovedlo se uložit — někdo jiný právě ukládá to samé. Zkus to za chvíli.');
  },
};

/* Zpráva ke commitu: první řádek = co se stalo, pod ním obsah (text poznámky,
   komentáře…) a nakonec podpis. Z toho skládá e-mailový souhrn notifikace.gs.
   `zprava` je buď text, nebo { nadpis, detail }. Řádek „Souhrn: ne" znamená,
   že commit do souhrnu nepatří (samotné soubory — informaci nese zápis do JSON). */
function zpravaCommitu(zprava, { doSouhrnu = true } = {}) {
  const { nadpis, detail, zakazka, zakazkaId } = typeof zprava === 'string' ? { nadpis: zprava } : zprava;
  const kratky = String(detail || '').trim();
  /* Nadpis i podpis jsou jeden řádek se stejně srovnanými mezerami —
     souhrn podle shody nadpisu se štítkem pozná, co se stalo. */
  const radek = (t) => String(t).replace(/\s+/g, ' ').trim();
  return [
    radek(nadpis),
    kratky ? (kratky.length > 600 ? kratky.slice(0, 600) + '…' : kratky) : '',
    [`Autor: ${radek(JA.jmeno || '?')} (${JA.role === 'klient' ? radek(KLIENT) : 'studio'})`,
     zakazka ? `Zakázka: ${radek(zakazka)}` : '',
     /* Stálý klíč skupiny v e-mailu — přežije přejmenování i doplnění ID. */
     zakazkaId ? `Zakázka-id: ${zakazkaId}` : '',
     doSouhrnu ? '' : 'Souhrn: ne'].filter(Boolean).join('\n'),
  ].filter(Boolean).join('\n\n');
}

/* ---------------------------------------------------------- stav */

const JA = { role: null, jmeno: null };
const S = { zakazky: [], ukoly: [], cenik: { polozky: [], podminky: '' } };
const UI = {
  filtr: pamet.cti(ulozKlic('filtr')) || 'aktivni', hledat: '', otevrena: null,
  ukladam: 0, hraje: new Set(), rozbaleno: new Set(), ukazHotove: false,
};


const najdi = (id) => S.zakazky.find((z) => z.id === id);

/* TOP přednosti nemovitosti = krátké štítky. Bez prázdných, bez duplicit
   (i s jinou velikostí písmen), rozumně dlouhé. */
const MAX_PREDNOSTI = 12;
function srovnejPrednosti(seznam) {
  const videne = new Set();
  return (Array.isArray(seznam) ? seznam : [])
    .map((t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 40))
    .filter((t) => t && !videne.has(t.toLowerCase()) && videne.add(t.toLowerCase()))
    .slice(0, MAX_PREDNOSTI);
}

const odkazMapy = (adresa) => `https://mapy.cz/zakladni?q=${encodeURIComponent(adresa)}`;

/* Odkaz z adresního řádku: bez https:// („sreality.cz/detail/…“) se doplní,
   jinak musí být http(s) s opravdovou doménou. Vrátí podobu k uložení,
   '' pro prázdné pole a null, když to odkaz není („později.“, „mailto:…“). */
function upravOdkaz(t) {
  const s = String(t || '').trim();
  if (!s) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!/\.(?:[a-z]{2,}|xn--[a-z0-9-]{2,})$/i.test(u.hostname)) return null;
    return u.href;
  } catch { return null; }
}
const NENI_ODKAZ = 'Tohle nevypadá jako odkaz — zkopíruj ho z adresního řádku prohlížeče.';

/* Nápady na scénář se dělí na tři druhy videa. Barva drží skupinu
   pohromadě, ať se nápady pro různá videa nepletou. */
const DRUHY_NAPADU = {
  sreality: { nazev: 'Sreality', format: '16:9', barva: 'zlata' },
  prodejni: { nazev: 'Prodejní reels', format: '9:16', barva: 'teal' },
  zabavny: { nazev: 'Zábavný reel', format: '9:16', barva: 'amber' },
};
/* Jak se zakázka jmenuje v historii změn a v e-mailovém souhrnu. */
const stitek = (z) => (z.kod ? `${z.nazev} (${z.kod})` : z.nazev);

/* Starší tvary dat umí přečíst i tenhle kokpit. Převody jsou schválně
   idempotentní — běží při každém načtení, dokud se zakázka neuloží. */
function normalizuj(z) {
  if (z.stav === 'archiv' || z.stav === 'kos') z.stav = 'hotove';
  if (z.odkazy && !Array.isArray(z.odkazy)) {
    const o = z.odkazy;
    z.fotky = z.fotky || o.fotky || '';
    z.vizualizace = z.vizualizace || o.vizualizace || '';
    z.inzerat = z.inzerat || o.inzerat || '';
    z.odkazy = [
      ...(o.podklady ? [{ nazev: 'Podklady', url: o.podklady }] : []),
      ...(z.dalsiOdkazy || []),
    ];
    delete z.dalsiOdkazy;
  }
  z.odkazy = (z.odkazy || []).map((o) => ({ id: o.id || 'o-' + encodeURIComponent(o.url || o.nazev || ''), nazev: o.nazev, url: o.url }));
  z.prohlidka3d = z.prohlidka3d || '';
  z.adresa = z.adresa || '';
  z.inzerat = z.inzerat || '';
  z.prednosti = srovnejPrednosti(z.prednosti);
  z.pudorysy = z.pudorysy || [];
  z.bannery = z.bannery || [];
  z.napady = (z.napady || []).filter((n) => n && n.text).map((n) => ({
    id: n.id, druh: DRUHY_NAPADU[n.druh] ? n.druh : 'sreality', text: n.text, kdo: n.kdo || '', kdy: n.kdy || '',
  }));
  z.nataceno = z.nataceno ?? z.terminNataceni ?? '';
  delete z.terminNataceni;

  /* Komentáře k jednotlivým položkám leží v jedné mapě podle klíče položky. */
  z.komentare = z.komentare || {};
  z.videa = (z.videa || []).map((v) => {
    const stary = v.popis ?? v.poznamka ?? '';
    if (stary && !z.komentare[v.id]) z.komentare[v.id] = { text: stary, kdo: '', kdy: '' };
    return { id: v.id, nazev: v.nazev, format: v.format === '9:16' ? '9:16' : '16:9', vimeo: v.vimeo || '' };
  });

  /* Dřívější poznámka na konci detailu se slila s popisem nahoře. */
  if (z.poznamka && !String(z.podnazev || '').includes(z.poznamka)) {
    z.podnazev = [z.podnazev, z.poznamka].filter(Boolean).join('\n');
  }
  z.podnazev = String(z.podnazev || '').replace(/\s+$/, '');  /* Enter navíc na konci */
  return z;
}

/* ---------------------------------------------------------- soubory

   Půdorysy a bannery se nahrávají přímo do privátního repa vedle dat.
   Repo je soukromé, takže se soubor nedá otevřít odkazem — stáhneme ho
   klíčem a uděláme z něj blob URL, na které už obyčejný odkaz funguje. */

const SEKCE = {
  pudorysy: { popis: 'Půdorysy', jednotne: 'půdorys', ikona: 'i-pudorys' },
  bannery: { popis: 'Bannery', jednotne: 'banner', ikona: 'i-banner' },
};

const MAX_SOUBOR = 10 * 1024 * 1024;
const blobUrl = new Map();

function vyberSoubory() {
  return new Promise((hotovo) => {
    const vstup = document.createElement('input');
    vstup.type = 'file';
    vstup.multiple = true;
    vstup.accept = 'image/*,application/pdf';
    vstup.onchange = () => hotovo([...vstup.files]);
    vstup.oncancel = () => hotovo([]);
    vstup.click();
  });
}

const souborNaB64 = (soubor) => new Promise((hotovo, chyba) => {
  const ctecka = new FileReader();
  ctecka.onload = () => hotovo(String(ctecka.result).split(',')[1]);
  ctecka.onerror = () => chyba(new Error('Soubor se nepodařilo přečíst.'));
  ctecka.readAsDataURL(soubor);
});

const pripona = (jmeno) => (jmeno.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1] || 'bin').toLowerCase();

/* Stáhne soubor z repa (jednou — pak se bere z paměti). */
const souborBloby = new Map();
async function souborBlob(cesta) {
  if (!souborBloby.has(cesta)) {
    souborBloby.set(cesta, (async () => {
      const r = await GH.volej(`${GH.cesta(cesta)}?ref=${CFG.branch}`, { headers: { Accept: 'application/vnd.github.raw' } });
      if (!r.ok) throw await GH.selhalo(r);
      return r.blob();
    })().catch((e) => { souborBloby.delete(cesta); throw e; }));
  }
  return souborBloby.get(cesta);
}

/* Adresa souboru, kterou umí otevřít prohlížeč. */
async function souborUrl(cesta) {
  if (blobUrl.has(cesta)) return blobUrl.get(cesta);
  const url = URL.createObjectURL(await souborBlob(cesta));
  blobUrl.set(cesta, url);
  return url;
}

/* Knihovna, která je potřeba jen výjimečně, se načte až ve chvíli potřeby. */
const nacteneKnihovny = new Map();
function nactiKnihovnu(src, jmeno) {
  if (window[jmeno]) return Promise.resolve(window[jmeno]);
  if (!nacteneKnihovny.has(src)) {
    nacteneKnihovny.set(src, new Promise((hotovo, chyba) => {
      const sk = document.createElement('script');
      sk.src = src;
      sk.onload = () => hotovo(window[jmeno]);
      sk.onerror = () => { nacteneKnihovny.delete(src); chyba(new Error('Nepodařilo se načíst pomocnou knihovnu.')); };
      document.head.append(sk);
    }));
  }
  return nacteneKnihovny.get(src);
}

/* Kokpit spuštěný z plochy iPhonu (bez Safari kolem). Tam stahování přes
   <a download> uvězní člověka na obrazovce bez cesty zpět — známá chyba iOS. */
const jeAplikaceNaIphonu = () =>
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  && (navigator.standalone === true || matchMedia('(display-mode: standalone)').matches);

/* Uloží soubor do počítače (u mobilu do Stažených). Vrací true, když se uložil
   nebo začal stahovat; false, když ho člověk v nabídce Sdílet zavřel. */
async function ulozDoPocitace(blob, nazev) {
  const soubor = new File([blob], nazev, { type: blob.type });
  if (jeAplikaceNaIphonu() && navigator.canShare?.({ files: [soubor] })) {
    /* Sdílení musí vyvolat klepnutí — proto napřed dialog s tlačítkem. */
    const v = await dialog({
      titulek: 'ZIP je připravený',
      popis: 'Klepni na Uložit a v nabídce vyber „Uložit do Souborů“.',
      pole: [], okText: 'Uložit',
    });
    if (!v) return false;
    try {
      await navigator.share({ files: [soubor] });
      return true;
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
  }
  const url = URL.createObjectURL(soubor);
  const a = Object.assign(document.createElement('a'), { href: url, download: nazev });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60000);
  return true;
}

/* Které ZIPy se právě připravují (zakázka:sekce) — pojistka proti dvojkliku. */
const zipuje = new Set();

/* Název souboru bez znaků, které systémy v názvu nesnesou. */
const bezpecnyNazev = (t) => String(t).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'soubor';

/* Když mezitím uložil někdo jiný, GitHub občas vrátí konflikt (409), i když
   jde o jiný soubor — posunula se větev. Pár pokusů s pauzou to vyřeší. */
async function sOpakovanim(akce) {
  for (let pokus = 0; ; pokus++) {
    try {
      return await akce();
    } catch (e) {
      if (pokus >= 3 || (e.stav !== 409 && e.stav !== 422)) throw e;
      await pauza(400 * (pokus + 1));
    }
  }
}

async function nahrajDoRepa(cesta, obsahB64, zprava) {
  const r = await GH.volej(GH.cesta(cesta), {
    method: 'PUT',
    body: JSON.stringify({ message: zpravaCommitu(zprava, { doSouhrnu: false }), content: obsahB64, branch: CFG.branch }),
  });
  if (!r.ok) throw await GH.selhalo(r);
}

async function smazZRepa(cesta, zprava) {
  const meta = await GH.volej(`${GH.cesta(cesta)}?ref=${CFG.branch}`);
  if (meta.status === 404) return;
  if (!meta.ok) throw await GH.selhalo(meta);
  const { sha } = await meta.json();
  const r = await GH.volej(GH.cesta(cesta), {
    method: 'DELETE',
    body: JSON.stringify({ message: zpravaCommitu(zprava, { doSouhrnu: false }), sha, branch: CFG.branch }),
  });
  if (!r.ok) throw await GH.selhalo(r);
}

/* Doplní náhledy a odkazy do dlaždic, které jsou právě na obrazovce. */
async function dopnutiSouboru(prvek) {
  prvek.dataset.hotovo = '1';
  const { soubor: cesta, typ } = prvek.dataset;
  try {
    const url = await souborUrl(cesta);
    prvek.href = url;
    prvek.classList.remove('nacita');
    if (typ.startsWith('image/')) {
      const img = new Image();
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      prvek.prepend(img);
    }
  } catch {
    prvek.classList.remove('nacita');
    prvek.classList.add('nedostupny');
  }
}

/* ---------------------------------------------------------- hlášky */

function hlaska(text, druh = '') {
  const e = document.createElement('div');
  e.className = 'hlaska ' + druh;
  e.innerHTML = `<svg class="icon"><use href="#${druh === 'chyba' ? 'i-krizek' : 'i-fajfka'}"/></svg><span>${esc(text)}</span>`;
  $('#hlasky').append(e);
  setTimeout(() => e.remove(), druh === 'chyba' ? 6500 : 2400);
}

/* Hláška, která zůstane viset, dokud ji sami neodklidíme — na průběh nahrávání. */
function hlaskaPrubeh(text) {
  const e = document.createElement('div');
  e.className = 'hlaska';
  e.innerHTML = `<span class="tocitko"></span><span></span>`;
  e.lastElementChild.textContent = text;
  $('#hlasky').append(e);
  return {
    text: (t) => { e.lastElementChild.textContent = t; },
    pryc: () => e.remove(),
  };
}

/* ---------------------------------------------------------- ukládání */

/* Zápisy z jednoho prohlížeče jdou na GitHub jeden po druhém, v pořadí,
   v jakém je člověk udělal. Souběžné zápisy by se sice sloučily, ale třeba
   rychle naťukané přednosti by skončily v jiném pořadí, než jak je psal. */
let frontaZapisu = Promise.resolve();

function uloz(zprava, kam, uprav) {
  UI.ukladam++;
  $('#btn-obnovit').classList.add('tocise');
  const zapis = frontaZapisu.then(() => ulozHned(zprava, kam, uprav));
  frontaZapisu = zapis.catch(() => {});
  return zapis;
}

/* Soubory, do kterých se během jedné dávky zápisů uložilo. */
const dotcene = new Set();

function prevezmi(kam) {
  const cerstve = GH.mezipamet[kam]?.data;
  if (!cerstve) return;
  if (kam === SOUBOR_ZAKAZKY) S.zakazky = cerstve.zakazky.map(normalizuj);
  else if (kam === SOUBOR_CENIK) S.cenik = cerstve;
  else S.ukoly = cerstve.polozky || [];
}

async function ulozHned(zprava, kam, uprav) {
  let ok = false;
  try {
    await GH.zmen(kam, uprav, zprava);
    dotcene.add(kam);
    ok = true;
  } catch (e) {
    /* Po neúspěchu zahodit ETag, jinak by další synchronizace dostala 304
       a aplikace by natrvalo zůstala u zastaralých dat. */
    delete GH.etag[kam];
    hlaska(e.message || 'Uložení se nepovedlo.', 'chyba');
  } finally {
    /* Čekají-li za námi další zápisy, necháme na obrazovce okamžitý stav —
       data ze serveru by ho na chvilku přepsala. Převezme je až poslední. */
    if (UI.ukladam <= 1 && dotcene.size) {
      dotcene.forEach(prevezmi);
      dotcene.clear();
      vykresli();
    }
    UI.ukladam--;
    if (!UI.ukladam) $('#btn-obnovit').classList.remove('tocise');
  }
  return ok;
}

/* Změna jedné zakázky podle id — funguje i po sloučení s cizí verzí. */
const ulozZakazku = (zprava, id, fn) => {
  const z = najdi(id);
  const s = typeof zprava === 'string' ? { nadpis: zprava } : zprava;
  return uloz(z ? { ...s, zakazka: s.zakazka || stitek(z), zakazkaId: z.id } : s, SOUBOR_ZAKAZKY,
    (d) => { const x = d.zakazky.find((y) => y.id === id); if (x) fn(x); });
};

/* ---------------------------------------------------------- vykreslení */

function vykresli() {
  if ($('#app').classList.contains('skryto')) return;
  $('#p-aktivni').textContent = S.zakazky.filter((z) => z.stav === 'aktivni').length;
  $('#p-hotove').textContent = S.zakazky.filter((z) => z.stav !== 'aktivni').length;
  $$('.zalozka').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.filtr === UI.filtr)));
  vykresliUkoly();
  vykresliPlochu();
  if (UI.otevrena) vykresliSuplik();
}

/* Pořadí zakázek = pořadí v datech. Mění se přetažením karty. */
function vyfiltrovane() {
  const h = UI.hledat.trim().toLowerCase();
  return S.zakazky
    .filter((z) => (UI.filtr === 'aktivni' ? z.stav === 'aktivni' : z.stav !== 'aktivni'))
    .filter((z) => !h || [z.nazev, z.podnazev, z.kod, z.adresa, ...z.prednosti, ...z.videa.map((v) => v.nazev),
      ...z.napady.map((n) => n.text), ...Object.values(z.komentare).map((k) => k.text)].join(' ').toLowerCase().includes(h));
}

/* ---------------------------------------------------------- poznámky a úkoly */

function vykresliUkoly() {
  const otevrene = S.ukoly.filter((u) => !u.hotovo).sort((a, b) => (b.kdy || '').localeCompare(a.kdy || ''));
  const hotove = S.ukoly.filter((u) => u.hotovo).sort((a, b) => (b.kdy || '').localeCompare(a.kdy || ''));

  $('#ukoly-pocet').textContent = otevrene.length;
  $('#ukoly-seznam').innerHTML = otevrene.map(polozkaUkolu).join('')
    || '<li class="pu-prazdno">Nic otevřeného. Napiš, co je potřeba vyřešit.</li>';

  $('#ukoly-hotove').innerHTML = hotove.length ? `
    <button class="pu-rozbalit" data-akce="ukoly-hotove" aria-expanded="${UI.ukazHotove}">
      ${UI.ukazHotove ? 'Skrýt hotové' : `Hotové (${hotove.length})`}
    </button>
    ${UI.ukazHotove ? `<ul class="pu-seznam">${hotove.map(polozkaUkolu).join('')}</ul>` : ''}` : '';

  /* Výběr zakázky přestavíme, jen když v něm zrovna nikdo nevybírá. */
  const vyber = $('#novy-ukol-zakazka');
  if (document.activeElement !== vyber) {
    const zvolena = vyber.value;
    vyber.innerHTML = '<option value="">Bez zakázky</option>'
      + S.zakazky.filter((z) => z.stav === 'aktivni').map((z) => `<option value="${esc(z.id)}">${esc(z.nazev)}</option>`).join('');
    vyber.value = S.zakazky.some((z) => z.id === zvolena) ? zvolena : '';
  }
}

function polozkaUkolu(u) {
  const z = u.zakazka && najdi(u.zakazka);
  return `
    <li class="pu ${u.hotovo ? 'hotovy' : ''}">
      <button class="pu-zaskrt" data-akce="ukol-prepnout" data-uid="${esc(u.id)}" role="checkbox"
              aria-checked="${!!u.hotovo}" aria-label="${u.hotovo ? 'Vrátit mezi otevřené' : 'Hotovo'}">
        <svg class="icon"><use href="#i-fajfka"/></svg>
      </button>
      <button class="pu-text" data-akce="ukol-upravit" data-uid="${esc(u.id)}">${esc(u.text)}</button>
      ${z ? `<button class="pu-zakazka" data-akce="otevri" data-id="${esc(z.id)}">${esc(z.nazev)}</button>` : ''}
      <span class="pu-kdo">${esc(u.kdo || '')}${u.kdy ? ' · ' + esc(kdyKratce(u.kdy)) : ''}</span>
    </li>`;
}

/* ---------------------------------------------------------- nástěnka */

function vykresliPlochu() {
  const seznam = vyfiltrovane();
  const plocha = $('#plocha');

  if (!seznam.length) {
    prekresli(plocha, `
      <div class="prazdno">
        <h3>${UI.hledat ? 'Nic se nenašlo' : UI.filtr === 'aktivni' ? 'Žádná aktivní zakázka' : 'Hotových zakázek zatím není'}</h3>
        <p>${UI.hledat ? 'Hledáme v názvech, popisech, videích i komentářích.' : UI.filtr === 'aktivni' ? 'Založ zakázku a přidej k ní fotky, vizualizace a videa.' : 'Hotové zakázky se sem přesunou z aktivních.'}</p>
        ${!UI.hledat && UI.filtr === 'aktivni' ? '<button class="btn-nova" style="margin:0 auto" data-akce="nova"><svg class="icon"><use href="#i-plus"/></svg> Nová zakázka</button>' : ''}
      </div>`);
    return;
  }

  prekresli(plocha, `<div class="mrizka">${seznam.map(karta).join('')}</div>`);
  $$('[data-nahled]:not([data-hotovo])', plocha).forEach(dopnutiNahledu);
}

const obalVidea = (z) => z.videa.find((v) => v.format === '16:9' && vimeoInfo(v.vimeo)) || z.videa.find((v) => vimeoInfo(v.vimeo));

function karta(z) {
  const obal = obalVidea(z);
  const info = obal && vimeoInfo(obal.vimeo);
  const siroka = z.videa.filter((v) => v.format !== '9:16').length;
  const vysoka = z.videa.filter((v) => v.format === '9:16').length;

  return `
    <article class="karta" id="karta-${esc(z.id)}" draggable="true" data-karta="${esc(z.id)}">
      ${info ? `
        <button class="karta-nahled" data-akce="otevri" data-id="${esc(z.id)}"
                data-nahled="${esc(info.id)}" data-hash="${esc(info.hash || '')}"
                aria-label="Otevřít ${esc(z.nazev)}"></button>` : ''}

      <div class="karta-telo">
        <button class="karta-nadpis" data-akce="otevri" data-id="${esc(z.id)}">
          <h3>${esc(z.nazev)}</h3>
        </button>
        ${z.adresa ? `<a class="karta-adresa" href="${esc(odkazMapy(z.adresa))}" target="_blank" rel="noopener" draggable="false" title="Otevřít v Mapy.cz"><svg class="icon"><use href="#i-pin"/></svg><span>${esc(z.adresa)}</span></a>` : ''}
        ${z.podnazev ? `<button class="karta-popis" data-akce="otevri" data-id="${esc(z.id)}">${esc(z.podnazev)}</button>` : ''}
        ${z.prednosti.length ? `
          <div class="stitky">
            ${z.prednosti.slice(0, 4).map((t) => `<button class="stitek" data-akce="filtr-stitek" data-stitek="${esc(t)}" title="Ukázat zakázky s „${esc(t)}“">${esc(t)}</button>`).join('')}
            ${z.prednosti.length > 4 ? `<button class="stitek dalsi" data-akce="otevri" data-id="${esc(z.id)}">+${z.prednosti.length - 4}</button>` : ''}
          </div>` : ''}

        <dl class="udaje">
          <div><dt>ID</dt><dd>${z.kod ? esc(z.kod) : '<i>nevyplněno</i>'}</dd></div>
          <div><dt>Natáčeno</dt><dd>${z.nataceno ? esc(denCesky(z.nataceno)) : '<i>nevyplněno</i>'}</dd></div>
        </dl>

        <div class="karta-odkazy">
          ${chipOdkaz('i-dum', 'Inzerát', z.inzerat, z.id, 'inzerat')}
          ${chipOdkaz('i-foto', 'Fotky', z.fotky, z.id, 'fotky')}
          ${chipOdkaz('i-kostka', 'Vizualizace', z.vizualizace, z.id, 'vizualizace')}
          ${chipOdkaz('i-3d', '3D prohlídka', z.prohlidka3d, z.id, 'prohlidka3d')}
        </div>

        <footer class="karta-pata">
          <span class="${siroka ? 'ma' : ''}">${siroka}× SREALITY</span>
          <span class="${vysoka ? 'ma' : ''}">${vysoka}× REELS</span>
          ${z.pudorysy.length ? `<span class="ma">${z.pudorysy.length}× PŮDORYS</span>` : ''}
          ${z.bannery.length ? `<span class="ma">${z.bannery.length}× BANNER</span>` : ''}
          ${z.napady.length ? `<span class="ma">${z.napady.length}× NÁPAD</span>` : ''}
          <span class="karta-poradi">
            <span class="karta-uchyt" title="Přetáhni kartu a změň pořadí"><svg class="icon"><use href="#i-uchyt"/></svg></span>
            <button data-akce="posun" data-id="${esc(z.id)}" data-smer="-1" title="Posunout dopředu" aria-label="Posunout dopředu"><svg class="icon"><use href="#i-nahoru"/></svg></button>
            <button data-akce="posun" data-id="${esc(z.id)}" data-smer="1" title="Posunout dozadu" aria-label="Posunout dozadu"><svg class="icon"><use href="#i-dolu"/></svg></button>
          </span>
        </footer>
      </div>
    </article>`;
}

const chipOdkaz = (ikona, popis, url, zid, klic) => url
  ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener" draggable="false"><svg class="icon"><use href="#${ikona}"/></svg><span>${esc(popis)}</span></a>`
  : `<button class="chip chybi" data-akce="odkaz" data-id="${esc(zid)}" data-klic="${klic}"><svg class="icon"><use href="#${ikona}"/></svg><span>${esc(popis)}</span></button>`;

async function dopnutiNahledu(prvek) {
  prvek.dataset.hotovo = '1';
  const { nahled: id, hash } = prvek.dataset;
  try {
    const url = await vimeoNahled({ id, hash, verejny: `https://vimeo.com/${id}${hash ? '/' + hash : ''}` });
    const img = new Image();
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    prvek.prepend(img);
  } catch { /* náhled není povinný */ }
}

/* Přesune zakázku `id` na místo zakázky `cilId`. Pracuje s identifikátory,
   takže sedí i po sloučení s verzí, kterou mezitím uložil někdo jiný. */
function preskladej(pole, id, cilId, dozadu) {
  const i = pole.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [kus] = pole.splice(i, 1);
  const j = pole.findIndex((x) => x.id === cilId);
  if (j < 0) { pole.splice(i, 0, kus); return; }
  pole.splice(dozadu ? j + 1 : j, 0, kus);
}

async function presunZakazku(id, cilId) {
  if (!id || !cilId || id === cilId) return;
  const viditelne = vyfiltrovane().map((z) => z.id);
  const dozadu = viditelne.indexOf(id) < viditelne.indexOf(cilId);
  preskladej(S.zakazky, id, cilId, dozadu);
  vykresliPlochu();
  if (!await uloz('Pořadí zakázek', SOUBOR_ZAKAZKY, (d) => preskladej(d.zakazky, id, cilId, dozadu))) synchronizuj();
}

/* ---------------------------------------------------------- detail */

/* Překreslí obsah tak, že změní jen to, co se opravdu liší (morphdom).
   Co má uživatel zrovna pod rukama, zůstane netknuté:
   – pole s kurzorem (rozepsaný text, výběr, napůl zadané datum, klávesnice na mobilu),
   – rozepsaná přednost, i když pole ztratilo fokus,
   – hrající video (jinak by se pustilo znovu od začátku),
   – dotažené náhledy videí a souborů (jinak by problikly). */
function prekresli(kontejner, html) {
  morphdom(kontejner, `<div>${html}</div>`, {
    childrenOnly: true,
    onBeforeElUpdated(stary, novy) {
      const pole = /^(INPUT|TEXTAREA|SELECT)$/.test(stary.tagName);
      if (pole && stary === document.activeElement) return false;
      if (stary.id === 'nova-prednost') { stary.placeholder = novy.placeholder; return false; }
      /* Přehrávač nechat, jen když je to přesně tatáž adresa (i s hashem skrytého videa). */
      if (stary.tagName === 'IFRAME' && novy.tagName === 'IFRAME' && stary.getAttribute('src') === novy.getAttribute('src')) return false;
      if (stary.dataset.hotovo && (
        (stary.dataset.nahled && stary.dataset.nahled === novy.dataset.nahled && (stary.dataset.hash || '') === (novy.dataset.hash || '')) ||
        (stary.dataset.soubor && stary.dataset.soubor === novy.dataset.soubor))) return false;
      /* Žádná zkratka přes isEqualNode: vidí jen atributy, takže by blok s polem,
         ve kterém je jiný text, prohlásila za stejný a pole by nikdy nesrovnala. */
      return true;
    },
  });
}

function vykresliSuplik() {
  const suplik = $('#suplik');
  if (UI.otevrena === CENIK) {
    prekresli(suplik, htmlCenik());
  } else {
    const z = najdi(UI.otevrena);
    if (!z) return zavri();
    prekresli(suplik, htmlDetail(z));
    $$('[data-nahled]:not([data-hotovo])', suplik).forEach(dopnutiNahledu);
    $$('[data-soubor]:not([data-hotovo])', suplik).forEach(dopnutiSouboru);
  }
  $$('textarea', suplik).forEach(dorovnej);
}

function dorovnej(pole) {
  pole.style.height = 'auto';
  pole.style.height = Math.min(pole.scrollHeight + 2, 420) + 'px';
}

/* Jeden rámeček pro každou sekci detailu — ať se obsah neslévá. */
const panel = ({ ikona, titulek, pocet = null, akce = '', obsah }) => `
  <section class="panel">
    <header class="panel-hlava${akce ? ' s-akcemi' : ''}">
      <svg class="icon"><use href="#${ikona}"/></svg>
      <h3>${esc(titulek)}</h3>
      ${pocet !== null ? `<span class="panel-pocet">${pocet}</span>` : ''}
      ${akce ? `<span class="panel-akce">${akce}</span>` : ''}
    </header>
    <div class="panel-telo">${obsah}</div>
  </section>`;

/* Komentář k položce: když je, ukáže se jako odlišený rámeček pod ní. */
function komentarPolozky(z, klic) {
  const k = z.komentare[klic];
  if (!k?.text) return '';
  return `
    <button class="koment" data-akce="komentar" data-klic="${esc(klic)}" title="Upravit komentář">
      <span class="koment-text">${esc(k.text)}</span>
      ${k.kdo ? `<span class="koment-kdo">${esc(k.kdo)}${k.kdy ? ' · ' + esc(kdyKratce(k.kdy)) : ''}</span>` : ''}
    </button>`;
}

/* Bublina u každé položky — otevře komentář k ní. Plná, když už nějaký je. */
const tlacitkoKomentare = (z, klic) => `
  <button class="ikonmini ${z.komentare[klic]?.text ? 'ma-komentar' : ''}" data-akce="komentar" data-klic="${esc(klic)}"
          title="${z.komentare[klic]?.text ? 'Upravit komentář' : 'Přidat komentář'}" aria-label="Komentář">
    <svg class="icon"><use href="#i-komentar"/></svg>
  </button>`;

function htmlDetail(z) {
  return `
    <div class="suplik-hlava">
      <div class="sh-radek">
        <input class="vstup kod-vstup" data-pole="kod" value="${esc(z.kod || '')}" placeholder="ID zakázky" aria-label="ID zakázky">
        <span class="rozpera"></span>
        <button class="mini" data-akce="prehodit">${z.stav === 'aktivni' ? 'Označit jako hotové' : 'Vrátit mezi aktivní'}</button>
        <button class="ikonbtn" data-akce="zavri" aria-label="Zavřít"><svg class="icon"><use href="#i-krizek"/></svg></button>
      </div>
      <h2><input class="vstup" data-pole="nazev" value="${esc(z.nazev)}" style="font:inherit" aria-label="Název zakázky"></h2>
      <textarea class="vstup popis-vstup" data-pole="podnazev" rows="1" aria-label="Popis zakázky"
                placeholder="Popis — dispozice, lokalita, co je potřeba…">${esc(z.podnazev || '')}</textarea>
      <div class="sh-datum">
        <label for="p-adresa">Adresa</label>
        <input class="vstup adresa-vstup" id="p-adresa" data-pole="adresa" value="${esc(z.adresa)}" placeholder="Ulice a číslo, obec" autocomplete="off">
        ${z.adresa ? `<a class="mini" href="${esc(odkazMapy(z.adresa))}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-pin"/></svg> Mapy</a>` : ''}
      </div>
      <div class="sh-datum">
        <label for="p-inzerat">Inzerát</label>
        <input class="vstup adresa-vstup" id="p-inzerat" data-pole="inzerat" value="${esc(z.inzerat)}" placeholder="Odkaz na inzerát — Sreality, web realitky…" inputmode="url" autocomplete="off" spellcheck="false">
        ${z.inzerat ? `<a class="mini" href="${esc(z.inzerat)}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-odkaz"/></svg> Otevřít</a>` : ''}
      </div>
      <div class="sh-datum">
        <label for="p-nataceno">Natáčeno</label>
        <input class="vstup datum-vstup" id="p-nataceno" type="date" data-pole="nataceno" value="${esc(z.nataceno || '')}">
      </div>
    </div>

    <div class="suplik-telo">
      ${panelPrednosti(z)}
      ${panelOdkazu(z)}
      ${panelSouboru(z, 'pudorysy')}
      ${panelNapadu(z)}
      ${panelVidei(z)}
      ${panelSouboru(z, 'bannery')}
      <div class="detail-pata">
        <button class="mini zrus" data-akce="smazat-zakazku"><svg class="icon"><use href="#i-kos"/></svg> Smazat zakázku</button>
      </div>
    </div>`;
}

/* ----- TOP přednosti ----- */

function panelPrednosti(z) {
  /* Návrhy = štítky z ostatních zakázek, ať se stejná přednost píše pokaždé stejně. */
  const moje = new Set(z.prednosti.map((t) => t.toLowerCase()));
  const navrhy = [...new Set(S.zakazky.flatMap((x) => x.prednosti))].filter((t) => !moje.has(t.toLowerCase())).sort((a, b) => a.localeCompare(b, 'cs'));
  const plno = z.prednosti.length >= MAX_PREDNOSTI;
  return panel({
    ikona: 'i-hvezda', titulek: 'TOP přednosti', pocet: z.prednosti.length,
    obsah: `
      ${z.prednosti.length ? `<div class="stitky velke">${z.prednosti.map((t) => `
        <span class="stitek">${esc(t)}<button data-akce="prednost-odebrat" data-stitek="${esc(t)}" title="Odebrat" aria-label="Odebrat ${esc(t)}"><svg class="icon"><use href="#i-krizek"/></svg></button></span>`).join('')}
      </div>` : ''}
      ${plno ? `<p class="prazdna-poznamka">Maximum je ${MAX_PREDNOSTI} — TOP má být to nejlepší.</p>` : `
        <form class="prednost-novy" data-zakazka="${esc(z.id)}" autocomplete="off">
          <input id="nova-prednost" list="prednosti-navrhy" maxlength="40" placeholder="${z.prednosti.length ? 'Další přednost…' : 'Např. Bazén, Les za plotem, Bez sousedů…'}" aria-label="Nová přednost">
          <datalist id="prednosti-navrhy">${navrhy.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
          <button type="submit" class="mini zlaty"><svg class="icon"><use href="#i-plus"/></svg> Přidat</button>
        </form>`}`,
  });
}

/* Štítek se ukáže hned, uložení doběhne na pozadí. Při chybě se data načtou znovu. */
async function pridejPrednost(zid, text) {
  const z = najdi(zid);
  const novy = srovnejPrednosti([text])[0];
  if (!z || !novy) return;
  if (z.prednosti.some((t) => t.toLowerCase() === novy.toLowerCase())) return hlaska('Tahle přednost už u zakázky je.');
  if (z.prednosti.length >= MAX_PREDNOSTI) return;
  z.prednosti = [...z.prednosti, novy];
  vykresliSuplik();
  vykresliPlochu();
  $('#nova-prednost')?.focus();
  const ok = await ulozZakazku({ nadpis: `${stitek(z)} — TOP přednost: ${novy}` }, z.id,
    (x) => { x.prednosti = srovnejPrednosti([...(x.prednosti || []), novy]); });
  if (!ok) synchronizuj();
}

/* ----- odkazy ----- */

const PEVNE_ODKAZY = [
  { klic: 'fotky', ikona: 'i-foto', nazev: 'Fotky' },
  { klic: 'vizualizace', ikona: 'i-kostka', nazev: 'Vizualizace' },
  { klic: 'prohlidka3d', ikona: 'i-3d', nazev: '3D prohlídka' },
];

function panelOdkazu(z) {
  const radky = [
    ...PEVNE_ODKAZY.map((o) => radekOdkazu(z, { ...o, url: z[o.klic], pevny: true })),
    ...z.odkazy.map((o) => radekOdkazu(z, { klic: o.id, ikona: 'i-odkaz', nazev: o.nazev, url: o.url, pevny: false })),
  ];
  return panel({
    ikona: 'i-odkaz', titulek: 'Odkazy',
    akce: '<button class="pridat" data-akce="pridat-odkaz"><svg class="icon"><use href="#i-plus"/></svg> Další odkaz</button>',
    obsah: `<div class="odkazy">${radky.join('')}</div>`,
  });
}

function radekOdkazu(z, { klic, ikona, nazev, url, pevny }) {
  return `
    <div class="polozka">
      <div class="odkaz-radek ${url ? '' : 'prazdny'}">
        <svg class="icon"><use href="#${ikona}"/></svg>
        <span class="odkaz-nazev">${esc(nazev)}</span>
        <span class="rozpera"></span>
        ${url
          ? `<a class="mini zlaty" href="${esc(url)}" target="_blank" rel="noopener">Otevřít <svg class="icon"><use href="#i-odkaz"/></svg></a>`
          : `<button class="mini" data-akce="odkaz" data-klic="${esc(klic)}">Doplnit odkaz</button>`}
        ${pevny && url ? `<button class="ikonmini" data-akce="odkaz" data-klic="${esc(klic)}" title="Změnit odkaz" aria-label="Změnit odkaz"><svg class="icon"><use href="#i-tuzka"/></svg></button>` : ''}
        ${tlacitkoKomentare(z, klic)}
        ${pevny ? '' : `<button class="ikonmini zrus" data-akce="smazat-odkaz" data-url="${esc(url)}" data-klic="${esc(klic)}" title="Odebrat odkaz" aria-label="Odebrat odkaz"><svg class="icon"><use href="#i-krizek"/></svg></button>`}
      </div>
      ${komentarPolozky(z, klic)}
    </div>`;
}

/* ----- soubory ----- */

const VIDITELNE_SOUBORY = 4;

function panelSouboru(z, sekce) {
  const { popis, jednotne, ikona } = SEKCE[sekce];
  const vse = z[sekce];
  const rozbaleno = UI.rozbaleno.has(z.id + ':' + sekce);
  const ukazat = rozbaleno ? vse : vse.slice(0, VIDITELNE_SOUBORY);
  const zbyva = vse.length - ukazat.length;

  return panel({
    ikona, titulek: popis, pocet: vse.length,
    akce: `${vse.length ? `<button class="pridat" data-akce="stahnout-vse" data-sekce="${sekce}" title="Stáhnout všechny ${esc(popis.toLowerCase())} v jednom ZIPu"><svg class="icon"><use href="#i-stahnout"/></svg> Stáhnout vše</button>` : ''}
      <button class="pridat" data-akce="nahrat" data-sekce="${sekce}"><svg class="icon"><use href="#i-nahrat"/></svg> Nahrát</button>`,
    obsah: vse.length ? `
      <div class="soubory">${ukazat.map((f) => dlazdiceSouboru(z, f, sekce)).join('')}</div>
      ${zbyva > 0 ? `<button class="rozbalit" data-akce="rozbalit" data-sekce="${sekce}">Zobrazit další (${zbyva})</button>` : ''}
      ${rozbaleno && vse.length > VIDITELNE_SOUBORY ? `<button class="rozbalit" data-akce="rozbalit" data-sekce="${sekce}">Sbalit</button>` : ''}`
      : `<p class="prazdna-poznamka">Zatím tu žádný ${esc(jednotne)} není. Nahraj obrázek nebo PDF.</p>`,
  });
}

function dlazdiceSouboru(z, f, sekce) {
  const obrazek = (f.typ || '').startsWith('image/');
  return `
    <div class="soubor polozka" id="soubor-${esc(f.id)}">
      <a class="soubor-nahled nacita" target="_blank" rel="noopener" draggable="false"
         data-soubor="${esc(f.cesta)}" data-typ="${esc(f.typ || '')}" title="${esc(f.nazev)}">
        ${obrazek ? '' : `<span class="soubor-typ">${esc(pripona(f.nazev).toUpperCase())}</span>`}
      </a>
      <div class="soubor-pata">
        <span class="soubor-nazev" title="${esc(f.nazev)}">${esc(f.nazev)}</span>
        ${tlacitkoKomentare(z, f.id)}
        <button class="ikonmini zrus" data-akce="smazat-soubor" data-sekce="${sekce}" data-sid="${esc(f.id)}" title="Smazat" aria-label="Smazat ${esc(f.nazev)}">
          <svg class="icon"><use href="#i-krizek"/></svg>
        </button>
      </div>
      ${komentarPolozky(z, f.id)}
    </div>`;
}

/* ----- nápady na scénář ----- */

function panelNapadu(z) {
  return panel({
    ikona: 'i-napad', titulek: 'Nápady na scénář', pocet: z.napady.length,
    obsah: `<div class="napady">${Object.entries(DRUHY_NAPADU).map(([druh, d]) => skupinaNapadu(z, druh, d)).join('')}</div>`,
  });
}

function skupinaNapadu(z, druh, d) {
  const napady = z.napady.filter((n) => n.druh === druh);
  return `
    <div class="napady-skupina ${d.barva}">
      <div class="ns-hlava">
        <span class="ns-nazev">${esc(d.nazev)}</span>
        <span class="ns-format">${d.format}</span>
        ${napady.length ? `<span class="ns-pocet">${napady.length}</span>` : ''}
        <span class="rozpera"></span>
        <button class="pridat" data-akce="napad-pridat" data-druh="${druh}"><svg class="icon"><use href="#i-plus"/></svg> Nápad</button>
      </div>
      ${napady.map((n) => napadHtml(z, n)).join('')}
    </div>`;
}

function napadHtml(z, n) {
  return `
    <div class="napad polozka" id="napad-${esc(n.id)}">
      <div class="napad-radek">
        <p class="napad-text">${esc(n.text)}</p>
        <div class="napad-akce">
          <button class="ikonmini" data-akce="napad-upravit" data-nid="${esc(n.id)}" title="Upravit nápad" aria-label="Upravit nápad"><svg class="icon"><use href="#i-tuzka"/></svg></button>
          ${tlacitkoKomentare(z, n.id)}
          <button class="ikonmini zrus" data-akce="napad-smazat" data-nid="${esc(n.id)}" title="Smazat nápad" aria-label="Smazat nápad"><svg class="icon"><use href="#i-kos"/></svg></button>
        </div>
      </div>
      ${n.kdo ? `<span class="napad-kdo">${esc(n.kdo)}${n.kdy ? ' · ' + esc(kdyKratce(n.kdy)) : ''}</span>` : ''}
      ${komentarPolozky(z, n.id)}
    </div>`;
}

/* ----- videa ----- */

/* Široká videa jdou přes celou šířku, svislá vždy vedle sebe v úzké
   mřížce — dvě reelska se tak nikdy neroztáhnou do obřích sloupců. */
function panelVidei(z) {
  const siroka = z.videa.filter((v) => v.format !== '9:16');
  const vysoka = z.videa.filter((v) => v.format === '9:16');
  return panel({
    ikona: 'i-prehrat', titulek: 'Videa', pocet: z.videa.length,
    akce: '<button class="pridat" data-akce="pridat-video"><svg class="icon"><use href="#i-plus"/></svg> Přidat video</button>',
    obsah: z.videa.length ? `
      ${siroka.length ? `<div class="videa-siroka">${siroka.map((v) => videoKarta(z, v)).join('')}</div>` : ''}
      ${vysoka.length ? `<div class="videa-vysoka">${vysoka.map((v) => videoKarta(z, v)).join('')}</div>` : ''}`
      : '<p class="prazdna-poznamka">Zatím tu žádné video není.</p>',
  });
}

function videoKarta(z, v) {
  const info = vimeoInfo(v.vimeo);
  return `
    <div class="video-karta polozka ${v.format === '9:16' ? 'w916' : 'w169'}" id="video-${esc(v.id)}">
      ${info
        ? `<div class="vk-ramecek">
             ${UI.hraje.has(v.id)
               ? `<iframe src="${esc(info.embed)}&autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${esc(v.nazev)}"></iframe>`
               : `<button class="vk-prehrat" data-akce="prehrat" data-vid="${esc(v.id)}" data-nahled="${esc(info.id)}" data-hash="${esc(info.hash || '')}" aria-label="Přehrát ${esc(v.nazev)}">
                    <span class="kolecko"><svg class="icon"><use href="#i-prehrat"/></svg></span>
                  </button>`}
           </div>`
        : `<button class="vk-bezodkazu" data-akce="video-upravit" data-vid="${esc(v.id)}">
             <svg class="icon"><use href="#i-odkaz"/></svg>
             <span><b>Vložit odkaz na Vimeo</b>Pak se přehraje tady.</span>
           </button>`}
      <div class="vk-telo">
        <span class="vk-format">${v.format === '9:16' ? 'REELS 9:16' : 'SREALITY 16:9'}</span>
        <span class="vk-nazev">${esc(v.nazev)}</span>
        <div class="vk-akce">
          <button class="ikonmini" data-akce="video-upravit" data-vid="${esc(v.id)}" title="Upravit video" aria-label="Upravit video"><svg class="icon"><use href="#i-tuzka"/></svg></button>
          ${info ? `<a class="ikonmini" href="${esc(info.verejny)}" target="_blank" rel="noopener" title="Otevřít na Vimeu" aria-label="Otevřít na Vimeu"><svg class="icon"><use href="#i-odkaz"/></svg></a>` : ''}
          ${tlacitkoKomentare(z, v.id)}
          <button class="ikonmini zrus" data-akce="video-smazat" data-vid="${esc(v.id)}" title="Smazat video" aria-label="Smazat video"><svg class="icon"><use href="#i-kos"/></svg></button>
        </div>
      </div>
      ${komentarPolozky(z, v.id)}
    </div>`;
}

/* Lidský název položky do dialogu komentáře. */
function nazevPolozky(z, klic) {
  const pevny = PEVNE_ODKAZY.find((o) => o.klic === klic);
  if (pevny) return pevny.nazev;
  const v = z.videa.find((x) => x.id === klic);
  if (v) return `Video — ${v.nazev}`;
  const f = [...z.pudorysy, ...z.bannery].find((x) => x.id === klic);
  if (f) return f.nazev;
  const n = z.napady.find((x) => x.id === klic);
  if (n) {
    const zacatek = n.text.replace(/\s+/g, ' ').trim();
    return `Nápad (${DRUHY_NAPADU[n.druh].nazev}) „${zacatek.length > 50 ? zacatek.slice(0, 50) + '…' : zacatek}“`;
  }
  return z.odkazy.find((x) => x.id === klic)?.nazev || '';
}

/* ---------------------------------------------------------- ceník */

const CENIK = '#cenik';

/* Čísla dostanou „Kč", texty jako „8 Kč/km" nebo „v ceně" zůstanou, jak jsou. */
const cenaText = (c) => (/^[+\-]?[\d\s]+$/.test(String(c || '').trim()) ? `${String(c).trim()} Kč` : String(c || ''));

function htmlCenik() {
  const polozky = S.cenik.polozky || [];
  const skupiny = [...new Set(polozky.map((p) => p.skupina || 'Ostatní'))];

  return `
    <div class="suplik-hlava">
      <div class="sh-radek">
        <span class="kod">CENÍK</span>
        <span class="rozpera"></span>
        <button class="pridat" data-akce="cenik-pridat"><svg class="icon"><use href="#i-plus"/></svg> Přidat položku</button>
        <button class="ikonbtn" data-akce="zavri" aria-label="Zavřít"><svg class="icon"><use href="#i-krizek"/></svg></button>
      </div>
      <h2>Natáčení realit</h2>
      <p class="cenik-uvod">Kliknutím na řádek se dá cokoliv upravit.</p>
    </div>

    <div class="suplik-telo">
      ${skupiny.map((s) => panel({
        ikona: 'i-cenik', titulek: s,
        obsah: `<div class="cenik">${polozky.filter((p) => (p.skupina || 'Ostatní') === s).map((p) => `
          <button class="cp" data-akce="cenik-polozka" data-pid="${esc(p.id)}">
            <span class="cp-nazev">${esc(p.nazev)}${p.poznamka ? `<small>${esc(p.poznamka)}</small>` : ''}</span>
            <span class="cp-tecky"></span>
            <span class="cp-cena">${esc(cenaText(p.cena))}</span>
          </button>`).join('')}</div>`,
      })).join('') || '<p class="prazdna-poznamka">Ceník je zatím prázdný.</p>'}

      ${panel({
        ikona: 'i-ukol', titulek: 'Podmínky',
        obsah: `<textarea class="vstup" data-cenik-pole="podminky" placeholder="Dodací lhůty, omezení, co je v ceně…">${esc(S.cenik.podminky || '')}</textarea>`,
      })}
    </div>`;
}

/* ---------------------------------------------------------- šuplík */

function otevri(id) {
  /* Jiná zakázka = čistý šuplík, ať nic nepřeteče k cizí zakázce. */
  if (UI.otevrena !== id) {
    $('#suplik').innerHTML = '';
    UI.hraje.clear();
  }
  UI.otevrena = id;
  $('#suplik').classList.add('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'false');
  $('#zaves').classList.add('otevreno');
  document.body.style.overflow = 'hidden';
  vykresliSuplik();
  $('.suplik-telo')?.scrollTo(0, 0);
}

function otevriCenik() {
  if (UI.otevrena !== CENIK) $('#suplik').innerHTML = '';
  UI.otevrena = CENIK;
  UI.hraje.clear();
  $('#suplik').classList.add('otevreno');
  $('#suplik').setAttribute('aria-hidden', 'false');
  $('#zaves').classList.add('otevreno');
  document.body.style.overflow = 'hidden';
  vykresliSuplik();
  $('.suplik-telo')?.scrollTo(0, 0);
}

function zavri() {
  UI.otevrena = null;
  UI.hraje.clear();
  $$('#suplik iframe').forEach((f) => f.remove());  /* jinak by video hrálo dál se zvukem */
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
  else if (p.typ === 'select') vstup = `<select id="${id}" name="${p.klic}">${p.volby.map((v) =>
      `<option value="${esc(v.id)}" ${v.id === p.hodnota ? 'selected' : ''}>${esc(v.nazev)}</option>`).join('')}</select>`;
  else vstup = `<input id="${id}" name="${p.klic}" type="${p.typ || 'text'}" value="${esc(p.hodnota || '')}" placeholder="${esc(p.placeholder || '')}">`;

  return `<div class="dlg-pole"><label for="${id}">${esc(p.label)}</label>${vstup}${p.napoveda ? `<span class="napoveda">${esc(p.napoveda)}</span>` : ''}</div>`;
}

function dialog({ titulek, popis, pole = [], okText = 'Uložit', nebezpeci = false, navic = null }) {
  const dlg = $('#dlg');
  $('#dlg-titulek').textContent = titulek;
  $('#dlg-popis').textContent = popis || '';
  $('#dlg-popis').classList.toggle('skryto', !popis);
  $('#dlg-telo').innerHTML = pole.map(dialogPole).join('');
  $('#dlg-ok').textContent = okText;
  $('#dlg-ok').classList.toggle('nebezpeci', nebezpeci);
  $('#dlg-extra').textContent = navic || '';
  $('#dlg-extra').classList.toggle('skryto', !navic);

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
      $('#dlg-extra').removeEventListener('click', navicKlik);
      dlg.removeEventListener('cancel', zavreno);
    };
    function odeslat(e) {
      e.preventDefault();
      const out = {};
      for (const [k, v] of new FormData($('#dlg-form')).entries()) out[k] = typeof v === 'string' ? v.trim() : v;
      uklid(); dlg.close(); hotovo(out);
    }
    function zrusit() { uklid(); dlg.close(); hotovo(null); }
    function navicKlik() { uklid(); dlg.close(); hotovo({ navic: true }); }
    function zavreno() { uklid(); hotovo(null); }
    $('#dlg-form').addEventListener('submit', odeslat);
    $('#dlg-zrusit').addEventListener('click', zrusit);
    $('#dlg-extra').addEventListener('click', navicKlik);
    dlg.addEventListener('cancel', zavreno);
  });
}

const potvrd = async (o) => (await dialog({ nebezpeci: true, ...o, pole: [] })) !== null;

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
    const popis = { inzerat: 'Inzerát', fotky: 'Fotky', vizualizace: 'Vizualizace', prohlidka3d: '3D prohlídka' }[d.klic] || 'Odkaz';
    const v = await dialog({
      titulek: popis,
      popis: d.klic === 'inzerat' ? 'Vlož odkaz na inzerát — Sreality, Bezrealitky, web realitky.'
        : d.klic === 'prohlidka3d' ? 'Vlož odkaz na 3D prohlídku — otevře se v novém okně.'
        : 'Vlož odkaz na Google Drive, Úschovnu, Zoner, galerii — cokoliv, co se dá otevřít v prohlížeči.',
      pole: [{ klic: 'url', label: 'Odkaz', hodnota: z[d.klic] || '', placeholder: 'https://…' }],
    });
    if (!v) return;
    const url = upravOdkaz(v.url);
    if (url === null) return hlaska(NENI_ODKAZ, 'chyba');
    return ulozZakazku({ nadpis: `${stitek(z)} — ${popis.toLowerCase()}`, detail: url }, z.id, (x) => { x[d.klic] = url; });
  }

  /* ----- ceník ----- */

  if (jmeno === 'cenik') return otevriCenik();

  if (jmeno === 'cenik-pridat' || jmeno === 'cenik-polozka') {
    const p = jmeno === 'cenik-polozka' ? (S.cenik.polozky || []).find((x) => x.id === d.pid) : null;
    const skupiny = [...new Set((S.cenik.polozky || []).map((x) => x.skupina).filter(Boolean))];
    const v = await dialog({
      titulek: p ? 'Upravit položku' : 'Nová položka ceníku',
      pole: [
        { klic: 'skupina', label: 'Skupina', hodnota: p?.skupina || skupiny[0] || '', placeholder: 'Např. Natáčení', napoveda: skupiny.length ? 'Zatím používáme: ' + skupiny.join(', ') : '' },
        { klic: 'nazev', label: 'Položka', hodnota: p?.nazev || '', placeholder: 'Např. Do 3 hodin natáčení' },
        { klic: 'cena', label: 'Cena', hodnota: p?.cena || '', placeholder: 'Např. 13 500 nebo 8 Kč/km', napoveda: 'Samotné číslo doplníme o „Kč". Text jako „v ceně" zůstane, jak ho napíšeš.' },
        { klic: 'poznamka', label: 'Poznámka', typ: 'textarea', hodnota: p?.poznamka || '', placeholder: 'Nepovinné upřesnění' },
      ],
      okText: p ? 'Uložit' : 'Přidat',
      navic: p ? 'Smazat' : null,
    });
    if (!v) return;

    if (v.navic) {
      if (!await potvrd({ titulek: 'Smazat položku?', popis: `„${p.nazev}" zmizí z ceníku.`, okText: 'Smazat' })) return;
      return uloz(`Ceník — smazáno ${p.nazev}`, SOUBOR_CENIK, (dd) => { dd.polozky = dd.polozky.filter((x) => x.id !== p.id); });
    }
    if (!v.nazev) return;

    return p
      ? uloz(`Ceník — ${v.nazev}`, SOUBOR_CENIK, (dd) => {
          const cil = (dd.polozky || []).find((x) => x.id === p.id);
          if (!cil) throw new Error('Tuhle položku už mezitím někdo smazal.');
          Object.assign(cil, v);
        })
      : uloz(`Ceník — přidáno ${v.nazev}`, SOUBOR_CENIK, (dd) => { (dd.polozky = dd.polozky || []).push({ id: uid('c'), ...v }); });
  }

  /* ----- poznámky a úkoly ----- */

  if (jmeno === 'ukoly-hotove') {
    UI.ukazHotove = !UI.ukazHotove;
    return vykresliUkoly();
  }

  if (jmeno === 'ukol-prepnout') {
    const u = S.ukoly.find((x) => x.id === d.uid);
    if (!u) return;
    const hotovo = !u.hotovo;
    u.hotovo = hotovo;  /* hned vidět, uložení doběhne na pozadí */
    vykresliUkoly();
    const ok = await uloz({ nadpis: hotovo ? 'Úkol hotový' : 'Úkol znovu otevřený', detail: u.text }, SOUBOR_UKOLY, (dd) => {
      const cil = (dd.polozky || []).find((x) => x.id === u.id);
      if (cil) cil.hotovo = hotovo;
    });
    if (!ok) synchronizuj();
    return;
  }

  if (jmeno === 'ukol-upravit') {
    const u = S.ukoly.find((x) => x.id === d.uid);
    if (!u) return;
    const v = await dialog({
      titulek: 'Poznámka',
      pole: [
        { klic: 'text', label: 'Text', typ: 'textarea', hodnota: u.text },
        { klic: 'zakazka', label: 'K zakázce', typ: 'select', hodnota: u.zakazka || '',
          volby: [{ id: '', nazev: 'Bez zakázky' }, ...S.zakazky.map((z) => ({ id: z.id, nazev: z.nazev }))] },
      ],
      okText: 'Uložit',
      navic: 'Smazat',
    });
    if (!v) return;
    if (v.navic) {
      if (!await potvrd({ titulek: 'Smazat poznámku?', popis: `„${u.text.slice(0, 80)}" zmizí.`, okText: 'Smazat' })) return;
      return uloz({ nadpis: 'Smazaná poznámka', detail: u.text }, SOUBOR_UKOLY, (dd) => { dd.polozky = (dd.polozky || []).filter((x) => x.id !== u.id); });
    }
    if (!v.text) return;
    return uloz({ nadpis: 'Upravená poznámka', detail: v.text }, SOUBOR_UKOLY, (dd) => {
      const cil = (dd.polozky || []).find((x) => x.id === u.id);
      if (!cil) throw new Error('Tuhle poznámku už mezitím někdo smazal.');
      cil.text = v.text;
      cil.zakazka = v.zakazka || '';
    });
  }

  /* Klik na štítek na kartě ukáže všechny zakázky se stejnou předností. */
  if (jmeno === 'filtr-stitek') {
    UI.hledat = d.stitek;
    $('#hledat').value = d.stitek;
    vykresliPlochu();
    return window.scrollTo({ top: $('.ovladani').offsetTop - 70, behavior: 'smooth' });
  }

  /* ----- pořadí zakázek ----- */

  if (jmeno === 'posun') {
    const viditelne = vyfiltrovane().map((z) => z.id);
    const i = viditelne.indexOf(d.id);
    const cil = viditelne[i + Number(d.smer)];
    return presunZakazku(d.id, cil);
  }

  /* ----- zakázka ----- */

  const z = najdi(UI.otevrena);
  if (!z) return;

  if (jmeno === 'prehodit') {
    const hotove = z.stav === 'aktivni';
    const novyStav = hotove ? 'hotove' : 'aktivni';
    z.stav = novyStav;
    UI.filtr = novyStav;
    pamet.pis(ulozKlic('filtr'), UI.filtr);
    vykresli();
    hlaska(hotove ? 'Přesunuto mezi hotové.' : 'Zpátky mezi aktivními.', 'uspech');
    if (!await ulozZakazku(`${stitek(z)} — ${hotove ? 'hotové' : 'zpět mezi aktivní'}`, z.id, (x) => { x.stav = novyStav; })) synchronizuj();
    return;
  }

  if (jmeno === 'komentar') {
    const klic = d.klic;
    const stary = z.komentare[klic]?.text || '';
    const v = await dialog({
      titulek: 'Komentář',
      popis: nazevPolozky(z, klic),
      pole: [{ klic: 'text', label: 'Komentář', typ: 'textarea', hodnota: stary, placeholder: 'Co je k tomu potřeba vědět…' }],
      okText: 'Uložit',
      navic: stary ? 'Smazat' : null,
    });
    if (!v) return;
    const text = v.navic ? '' : (v.text || '').trim();
    if (text === stary) return;
    return ulozZakazku({ nadpis: `${stitek(z)} — ${text ? 'komentář' : 'smazán komentář'}: ${nazevPolozky(z, klic)}`, detail: text }, z.id, (x) => {
      x.komentare = x.komentare || {};
      if (text) x.komentare[klic] = { text, kdo: JA.jmeno, kdy: nyni() };
      else delete x.komentare[klic];
      /* Starý popis videa by se po smazání komentáře zase vynořil. */
      const vid = (x.videa || []).find((y) => y.id === klic);
      if (vid) { delete vid.popis; delete vid.poznamka; }
    });
  }

  if (jmeno === 'napad-pridat' || jmeno === 'napad-upravit') {
    const n = jmeno === 'napad-upravit' ? z.napady.find((x) => x.id === d.nid) : null;
    if (jmeno === 'napad-upravit' && !n) return;
    const v = await dialog({
      titulek: n ? 'Upravit nápad' : 'Nový nápad na scénář',
      pole: [
        { klic: 'druh', label: 'Pro video', typ: 'prepinac', hodnota: n?.druh || d.druh || 'sreality',
          volby: Object.entries(DRUHY_NAPADU).map(([id, x]) => ({ id, nazev: x.nazev })) },
        { klic: 'text', label: 'Nápad', typ: 'textarea', hodnota: n?.text || '', placeholder: 'Hook, děj, klíčový záběr, pointa…' },
      ],
      okText: n ? 'Uložit' : 'Přidat',
    });
    if (!v?.text) return;
    const druh = DRUHY_NAPADU[v.druh] ? v.druh : 'sreality';
    if (n && v.text === n.text && druh === n.druh) return;
    return n
      ? ulozZakazku({ nadpis: `${stitek(z)} — upraven nápad: ${DRUHY_NAPADU[druh].nazev}`, detail: v.text }, z.id, (x) => {
          const cil = (x.napady || []).find((y) => y.id === n.id);
          if (!cil) throw new Error('Tenhle nápad už mezitím někdo smazal.');
          cil.text = v.text;
          cil.druh = druh;
        })
      : ulozZakazku({ nadpis: `${stitek(z)} — nový nápad: ${DRUHY_NAPADU[druh].nazev}`, detail: v.text }, z.id, (x) => {
          (x.napady = x.napady || []).push({ id: uid('n'), druh, text: v.text, kdo: JA.jmeno, kdy: nyni() });
        });
  }

  if (jmeno === 'napad-smazat') {
    const n = z.napady.find((x) => x.id === d.nid);
    if (!n) return;
    const ukazka = n.text.length > 80 ? n.text.slice(0, 80) + '…' : n.text;
    if (!await potvrd({ titulek: 'Smazat nápad?', popis: `„${ukazka}" zmizí i s komentářem.`, okText: 'Smazat' })) return;
    return ulozZakazku({ nadpis: `${stitek(z)} — smazán nápad: ${DRUHY_NAPADU[n.druh].nazev}`, detail: n.text }, z.id, (x) => {
      x.napady = (x.napady || []).filter((y) => y.id !== n.id);
      if (x.komentare) delete x.komentare[n.id];
    });
  }

  if (jmeno === 'prednost-odebrat') {
    const text = d.stitek;
    z.prednosti = z.prednosti.filter((t) => t !== text);
    vykresliSuplik();
    vykresliPlochu();
    const ok = await ulozZakazku({ nadpis: `${stitek(z)} — odebrána přednost: ${text}` }, z.id,
      (x) => { x.prednosti = (x.prednosti || []).filter((t) => t.toLowerCase() !== text.toLowerCase()); });
    if (!ok) synchronizuj();
    return;
  }

  if (jmeno === 'rozbalit') {
    const klic = z.id + ':' + d.sekce;
    UI.rozbaleno.has(klic) ? UI.rozbaleno.delete(klic) : UI.rozbaleno.add(klic);
    return vykresliSuplik();
  }

  if (jmeno === 'nahrat') {
    const sekce = d.sekce;
    const soubory = await vyberSoubory();
    if (!soubory.length) return;

    const velky = soubory.find((f) => f.size > MAX_SOUBOR);
    if (velky) return hlaska(`„${velky.name}" má přes 10 MB. Zmenši ho a zkus to znovu.`, 'chyba');

    const prubeh = hlaskaPrubeh('Nahrávám…');
    const nahrane = [];
    try {
      for (const [i, f] of soubory.entries()) {
        prubeh.text(`Nahrávám ${i + 1} z ${soubory.length} — ${f.name}`);
        const id = uid('s');
        const cesta = `soubory/${z.id}/${id}.${pripona(f.name)}`;
        const obsah = await souborNaB64(f);
        await sOpakovanim(() => nahrajDoRepa(cesta, obsah, `${stitek(z)} — ${SEKCE[sekce].jednotne}: ${f.name}`));
        nahrane.push({ id, nazev: f.name, cesta, typ: f.type || '' });
      }
      prubeh.text('Ukládám…');
      const ok = await ulozZakazku(
        `${stitek(z)} — ${SEKCE[sekce].popis.toLowerCase()} (${nahrane.length})`,
        z.id,
        (x) => { x[sekce] = [...(x[sekce] || []), ...nahrane]; });
      if (!ok) throw new Error('Soubory se nahrály, ale zápis do zakázky selhal.');
      hlaska(nahrane.length === 1 ? 'Nahráno.' : `Nahráno ${nahrane.length} souborů.`, 'uspech');
    } catch (e) {
      /* Ať v repu nezůstanou soubory, které k žádné zakázce nepatří. */
      for (const n of nahrane) { try { await sOpakovanim(() => smazZRepa(n.cesta, 'Úklid nedokončeného nahrávání')); } catch {} }
      hlaska(e.message || 'Nahrání se nepovedlo.', 'chyba');
    } finally {
      prubeh.pryc();
    }
    return;
  }

  /* Všechny soubory sekce v jednom ZIPu. Soubory jsou v soukromém repu,
     takže je kokpit stáhne klíčem a zabalí přímo v prohlížeči. */
  if (jmeno === 'stahnout-vse') {
    const sekce = d.sekce;
    const soubory = [...(z[sekce] || [])];
    const klicZipu = z.id + ':' + sekce;
    if (!soubory.length || zipuje.has(klicZipu)) return;  /* dvojklik = jeden ZIP */
    zipuje.add(klicZipu);
    const prubeh = hlaskaPrubeh('Připravuji ZIP…');
    try {
      const fflate = await nactiKnihovnu('vendor/fflate.min.js', 'fflate');
      const obsah = {};
      const pouzita = new Set();
      let chybi = 0;
      for (const [i, f] of soubory.entries()) {
        prubeh.text(`Stahuji ${i + 1} z ${soubory.length} — ${f.nazev}`);
        try {
          const data = new Uint8Array(await (await souborBlob(f.cesta)).arrayBuffer());
          /* Stejné názvy dostanou číslo, jinak by se v ZIPu přepsaly. */
          let jmeno = bezpecnyNazev(f.nazev);
          for (let n = 2; pouzita.has(jmeno.toLowerCase()); n++) jmeno = bezpecnyNazev(f.nazev).replace(/(\.[^.]*)?$/, ` (${n})$1`);
          pouzita.add(jmeno.toLowerCase());
          obsah[jmeno] = [data, { level: 0 }];  // obrázky a PDF jsou už zkomprimované
        } catch {
          chybi++;
        }
      }
      if (!Object.keys(obsah).length) throw new Error('Žádný soubor se nepodařilo stáhnout.');
      prubeh.text('Balím…');
      const zip = fflate.zipSync(obsah);
      prubeh.pryc();
      const ulozeno = await ulozDoPocitace(new Blob([zip], { type: 'application/zip' }), `${bezpecnyNazev(z.nazev)} – ${SEKCE[sekce].popis.toLowerCase()}.zip`);
      if (ulozeno) {
        hlaska(chybi ? `ZIP je stažený, ale ${chybi} ${chybi === 1 ? 'soubor' : 'souborů'} se nepodařilo přidat.` : 'ZIP je stažený.', chybi ? 'chyba' : 'uspech');
      }
    } catch (e) {
      hlaska(e.message || 'ZIP se nepodařilo připravit.', 'chyba');
    } finally {
      prubeh.pryc();
      zipuje.delete(klicZipu);
    }
    return;
  }

  if (jmeno === 'smazat-soubor') {
    const sekce = d.sekce;
    const f = (z[sekce] || []).find((x) => x.id === d.sid);
    if (!f) return;
    if (!await potvrd({ titulek: 'Smazat soubor?', popis: `„${f.nazev}" zmizí ze zakázky i s komentářem.`, okText: 'Smazat' })) return;
    if (!await ulozZakazku(`${stitek(z)} — smazán ${SEKCE[sekce].jednotne} ${f.nazev}`, z.id, (x) => {
      x[sekce] = (x[sekce] || []).filter((y) => y.id !== f.id);
      if (x.komentare) delete x.komentare[f.id];
    })) return;
    const url = blobUrl.get(f.cesta);
    if (url) { URL.revokeObjectURL(url); blobUrl.delete(f.cesta); }
    souborBloby.delete(f.cesta);
    try { await sOpakovanim(() => smazZRepa(f.cesta, `Smazán soubor ${f.nazev}`)); } catch { /* záznam je pryč, zbytek nevadí */ }
    return;
  }

  if (jmeno === 'pridat-odkaz') {
    const v = await dialog({
      titulek: 'Další odkaz',
      pole: [
        { klic: 'nazev', label: 'Jak se jmenuje', hodnota: '', placeholder: 'Např. Inzerát' },
        { klic: 'url', label: 'Odkaz', typ: 'url', hodnota: '', placeholder: 'https://…' },
      ],
    });
    if (!v?.url) return;
    return ulozZakazku(`${stitek(z)} — přidán odkaz`, z.id, (x) => {
      (x.odkazy = x.odkazy || []).push({ id: uid('o'), nazev: v.nazev || 'Odkaz', url: v.url });
    });
  }

  /* Mazat podle adresy, ne podle pořadí — po sloučení s cizí verzí
     by index ukazoval na úplně jiný odkaz. */
  if (jmeno === 'smazat-odkaz') {
    if (!await potvrd({ titulek: 'Odebrat odkaz?', okText: 'Odebrat' })) return;
    return ulozZakazku(`${stitek(z)} — odebrán odkaz`, z.id, (x) => {
      const i = (x.odkazy || []).findIndex((o) => o.url === d.url);
      if (i < 0) throw new Error('Tenhle odkaz už mezitím někdo odebral.');
      x.odkazy.splice(i, 1);
      if (x.komentare) delete x.komentare[d.klic];
    });
  }

  if (jmeno === 'pridat-video' || jmeno === 'video-upravit') {
    const v = jmeno === 'video-upravit' ? z.videa.find((x) => x.id === d.vid) : null;
    const data = await dialog({
      titulek: v ? 'Upravit video' : 'Nové video',
      pole: [
        { klic: 'nazev', label: 'Název', hodnota: v?.nazev || '', placeholder: 'Např. Prohlídka domu' },
        { klic: 'format', label: 'Formát', typ: 'prepinac', hodnota: v?.format || '16:9', volby: [{ id: '16:9', nazev: '16:9 Sreality' }, { id: '9:16', nazev: '9:16 Reels' }] },
        { klic: 'vimeo', label: 'Odkaz na Vimeo', hodnota: v?.vimeo || '', placeholder: 'https://vimeo.com/123456789', napoveda: 'Funguje veřejný i skrytý odkaz včetně hashe (vimeo.com/123456789/abc123).' },
      ],
    });
    if (!data?.nazev) return;
    if (data.vimeo && !vimeoInfo(data.vimeo)) return hlaska('Tenhle odkaz nevypadá jako Vimeo. Zkontroluj ho.', 'chyba');

    return v
      ? ulozZakazku(`${stitek(z)} — upraveno video ${data.nazev}`, z.id, (x) => {
          const cil = (x.videa || []).find((y) => y.id === v.id);
          if (!cil) throw new Error('Tohle video už mezitím někdo smazal.');
          Object.assign(cil, data);
        })
      : ulozZakazku(`${stitek(z)} — přidáno video ${data.nazev}`, z.id, (x) => { (x.videa = x.videa || []).push({ id: uid('v'), ...data }); });
  }

  if (jmeno === 'video-smazat') {
    const v = z.videa.find((x) => x.id === d.vid);
    if (!v || !await potvrd({ titulek: 'Smazat video?', popis: `„${v.nazev}" zmizí z kokpitu i s komentářem. Soubor na Vimeu zůstane, kde je.`, okText: 'Smazat' })) return;
    return ulozZakazku(`${stitek(z)} — smazáno video ${v.nazev}`, z.id, (x) => {
      x.videa = (x.videa || []).filter((y) => y.id !== v.id);
      if (x.komentare) delete x.komentare[v.id];
    });
  }

  if (jmeno === 'prehrat') {
    const info = vimeoInfo(z.videa.find((x) => x.id === d.vid)?.vimeo);
    if (!info) return;
    /* Přehrávač vykreslí šablona — jen tak má stejnou podobu jako při každém
       dalším překreslení a morphdom ho nechá hrát. */
    UI.hraje.add(d.vid);
    return vykresliSuplik();
  }

  if (jmeno === 'smazat-zakazku') {
    if (!await potvrd({
      titulek: 'Smazat zakázku?',
      popis: `„${z.nazev}" zmizí i s videi, soubory a komentáři. Zůstane v historii na GitHubu, odkud ji ${CFG.spravce || 'studio'} umí vrátit.`,
      okText: 'Smazat',
    })) return;
    const ok = await uloz({ nadpis: `${stitek(z)} — smazána zakázka`, zakazka: stitek(z), zakazkaId: z.id }, SOUBOR_ZAKAZKY,
      (dd) => { dd.zakazky = dd.zakazky.filter((x) => x.id !== z.id); });
    if (ok) { zavri(); hlaska('Zakázka smazána.', 'uspech'); }
  }
}

async function novaZakazka() {
  const v = await dialog({
    titulek: 'Nová zakázka',
    pole: [
      { klic: 'nazev', label: 'Název', hodnota: '', placeholder: 'Např. Vinohrady — Bělehradská' },
      { klic: 'podnazev', label: 'Popis', hodnota: '', placeholder: 'Např. Byt 3+kk · 92 m² · Praha 2' },
      { klic: 'adresa', label: 'Adresa', hodnota: '', placeholder: 'Ulice a číslo, obec' },
      { klic: 'inzerat', label: 'Inzerát', hodnota: '', placeholder: 'Odkaz na inzerát — nemusí být hned' },
      { klic: 'nataceno', label: 'Natáčeno', typ: 'date', hodnota: '' },
      {
        klic: 'kod', label: 'ID zakázky', hodnota: '', placeholder: 'Nechat prázdné',
        napoveda: 'Nemusíš vyplňovat hned — doplnit se dá kdykoliv později v detailu zakázky.',
      },
    ],
    okText: 'Založit',
  });
  if (!v?.nazev) return;
  const inzerat = upravOdkaz(v.inzerat);

  const nova = {
    id: uid('z'),
    kod: v.kod,
    nazev: v.nazev,
    podnazev: v.podnazev,
    adresa: v.adresa,
    inzerat: inzerat ?? '',
    prednosti: [],
    nataceno: v.nataceno,
    stav: 'aktivni',
    fotky: '',
    vizualizace: '',
    odkazy: [],
    prohlidka3d: '',
    pudorysy: [],
    bannery: [],
    napady: [],
    videa: [],
    komentare: {},
    vytvoreno: nyni(),
  };
  UI.filtr = 'aktivni';
  pamet.pis(ulozKlic('filtr'), UI.filtr);
  const zprava = { nadpis: `${stitek(nova)} — nová zakázka`, detail: nova.podnazev, zakazka: stitek(nova), zakazkaId: nova.id };
  /* Hned na nástěnku i do detailu — uložení doběhne na pozadí. */
  S.zakazky = [normalizuj(structuredClone(nova)), ...S.zakazky];
  vykresli();
  otevri(nova.id);
  if (inzerat === null) hlaska('Inzerát se neuložil — nevypadá jako odkaz. Doplň ho v detailu zakázky.', 'chyba');
  if (!await uloz(zprava, SOUBOR_ZAKAZKY, (d) => { d.zakazky.unshift(nova); })) synchronizuj();
}

/* Jedno pole se ukládá jen jednou naráz — u data přijde change i focusout. */
const ukladanaPole = new WeakSet();

async function ulozPole(prvek) {
  if (ukladanaPole.has(prvek)) return;
  ukladanaPole.add(prvek);
  try { await ulozPoleHned(prvek); } finally { ukladanaPole.delete(prvek); }
}

async function ulozPoleHned(prvek) {
  const z = najdi(UI.otevrena);
  if (!z) return;
  const klic = prvek.dataset.pole;
  const nova = klic === 'inzerat' ? upravOdkaz(prvek.value)
    : ['nazev', 'kod', 'adresa'].includes(klic) ? prvek.value.trim()
    : klic === 'podnazev' ? prvek.value.replace(/\s+$/, '') : prvek.value;
  if (klic === 'nazev' && !nova) { prvek.value = z.nazev; return; }  /* zakázka bez názvu by na nástěnce zmizela */
  if (nova === null) {
    hlaska(NENI_ODKAZ, 'chyba');
    prvek.value = z.inzerat;
    return;
  }
  if (klic === 'nataceno' && nova && !/^(19|20)\d\d-\d\d-\d\d$/.test(nova)) {
    hlaska('Tohle datum nevypadá správně, neuložil jsem ho.', 'chyba');
    prvek.value = z.nataceno || '';
    return;
  }
  if (String(z[klic] ?? '') === nova) { prvek.value = nova; return; }

  /* Druhá strana pole mezitím změnila — nepřepisovat to naslepo. */
  const vychozi = vychoziHodnota.get(prvek);
  vychoziHodnota.delete(prvek);
  const aktualni = String(z[klic] ?? '');
  if (vychozi !== undefined && aktualni !== vychozi) {
    const ukazka = aktualni.length > 140 ? aktualni.slice(0, 140) + '…' : aktualni;
    const prepsat = await potvrd({
      titulek: 'Mezitím to změnil někdo jiný',
      popis: `Teď je tam: „${ukazka || '(prázdné)'}“. Uložit místo toho tvoji verzi?`,
      okText: 'Uložit moji', nebezpeci: false,
    });
    if (!prepsat) { vykresliSuplik(); return; }
  }
  const nazvy = { nazev: 'název', podnazev: 'popis', kod: 'ID zakázky', nataceno: 'datum natáčení', adresa: 'adresa', inzerat: 'inzerát' };
  /* V souhrnu je vidět i nová hodnota, ne jen „změnil název“. Štítek se vezme
     před změnou, ať nadpis i řádek „Zakázka:“ mluví o téže zakázce. */
  const hodnota = klic === 'nataceno' ? denCesky(nova) : nova;
  const puvodni = stitek(z);
  /* Na obrazovce hned — za zápisem můžou ve frontě čekat další a do té doby
     by se jinak ukazovala stará hodnota. */
  z[klic] = nova;
  if (klic === 'podnazev') z.poznamka = '';
  vykresli();
  const ok = await ulozZakazku({ nadpis: `${puvodni} — ${nazvy[klic] || klic}`, detail: hodnota, zakazka: puvodni }, z.id, (x) => {
    x[klic] = nova;
    if (klic === 'podnazev') x.poznamka = '';  /* stará poznámka už je v popisu */
  });
  if (ok) hlaska('Uloženo.', 'uspech');
  else synchronizuj();
}

/* ---------------------------------------------------------- načtení */

async function nactiVse({ podminene = false } = {}) {
  const [z, k, c] = await Promise.all([
    GH.nacti(SOUBOR_ZAKAZKY, { podminene }),
    GH.nacti(SOUBOR_UKOLY, { podminene }),
    GH.nacti(SOUBOR_CENIK, { podminene }).catch(() => ({ zmeneno: false })),
  ]);
  let zmena = false;
  if (z.zmeneno) { S.zakazky = (z.data.zakazky || []).map(normalizuj); zmena = true; }
  if (k.zmeneno) { S.ukoly = k.data.polozky || []; zmena = true; }
  if (c.zmeneno) { S.cenik = { polozky: c.data.polozky || [], podminky: c.data.podminky || '' }; zmena = true; }
  if (zmena) {
    pamet.pis(ulozKlic('cache'), JSON.stringify({ zakazky: S.zakazky, ukoly: S.ukoly, cenik: S.cenik }));
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
  pamet.smaz(ulozKlic('sez'));
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
    const c = JSON.parse(pamet.cti(ulozKlic('cache')) || 'null');
    if (c) {
      S.zakazky = (c.zakazky || []).map(normalizuj);
      S.ukoly = c.ukoly || [];
      S.cenik = c.cenik || S.cenik;
      vykresli();
    }
  } catch {}

  try {
    await nactiVse();
  } catch (e) {
    if (e.stav === 401) return odhlas(e.message);
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
    let jmeno = pamet.cti(ulozKlic('jmeno'));
    if (!jmeno) {
      const v = await dialog({
        titulek: 'Jak se podepisovat?',
        popis: 'Tohle jméno uvidí druhá strana u každého komentáře.',
        pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: CFG.jmena?.[vysledek.role] || '', placeholder: 'Křestní jméno' }],
        okText: 'Pokračovat',
      });
      if (!v?.jmeno) {
        if (v) $('#zamek-chyba').textContent = 'Napiš jméno, pod kterým se budeš podepisovat, a otevři znovu.';
        return;
      }
      jmeno = v.jmeno.trim().slice(0, 40);
      pamet.pis(ulozKlic('jmeno'), jmeno);
    }
    pamet.pis(ulozKlic('sez'), JSON.stringify({ token: vysledek.token, role: vysledek.role, otisk: otiskKlicu() }));
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

/* Hodnota pole ve chvíli, kdy do něj člověk vstoupil — podle ní se pozná,
   že ho mezitím změnila druhá strana. */
const vychoziHodnota = new WeakMap();

document.addEventListener('focusin', (e) => {
  const pole = e.target.closest?.('#suplik [data-pole]');
  const z = pole && najdi(UI.otevrena);
  if (z) vychoziHodnota.set(pole, String(z[pole.dataset.pole] ?? ''));
});

/* Po opuštění pole: datum se uloží až teď (při psaní z klávesnice by každá
   rozepsaná podoba roku byla commit) a pole dostane aktuální hodnotu — mohla
   se změnit, zatímco v něm byl kurzor a překreslování ho vynechávalo. */
document.addEventListener('focusout', (e) => {
  if (!e.target.matches?.('#suplik [data-pole], #suplik [data-cenik-pole]')) return;
  if (e.target.type === 'date') ulozPole(e.target);
  setTimeout(() => { if (UI.otevrena && !$('#dlg').open) vykresliSuplik(); }, 0);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-pole]')) {
    if (e.target.type === 'date' && document.activeElement === e.target) return;  /* uloží focusout */
    return ulozPole(e.target);
  }
  if (e.target.matches('[data-cenik-pole]')) {
    const klic = e.target.dataset.cenikPole;
    const nova = e.target.value;
    if (String(S.cenik[klic] ?? '') === nova) return;
    uloz('Ceník — podmínky', SOUBOR_CENIK, (dd) => { dd[klic] = nova; });
  }
});
document.addEventListener('input', (e) => { if (e.target.matches('#suplik textarea')) dorovnej(e.target); });

document.addEventListener('keydown', (e) => {
  /* Tužka a křížek u odkazů jsou spany uvnitř <a>, takže je musíme
     na klávesnici aktivovat sami. */
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-akce][role="button"]')) {
    e.preventDefault();
    e.stopPropagation();
    return akce(e.target.dataset.akce, e.target);
  }
  /* Enter v políčku ho potvrdí — bez toho by to vypadalo, že se nic neuložilo. */
  if (e.key === 'Enter' && e.target.matches?.('input[data-pole], input[data-cenik-pole]')) {
    e.preventDefault();
    return e.target.blur();
  }
  if (e.key === 'Escape' && UI.otevrena && !$('#dlg').open) {
    if (document.activeElement?.matches?.('[data-pole], [data-cenik-pole]')) document.activeElement.blur();
    zavri();
  }
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); $('#hledat').focus(); }
});

$('#hledat').addEventListener('input', (e) => { UI.hledat = e.target.value; vykresliPlochu(); });

$('.zalozky').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filtr]');
  if (!b) return;
  UI.filtr = b.dataset.filtr;
  pamet.pis(ulozKlic('filtr'), UI.filtr);
  vykresli();
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest?.('.prednost-novy');
  if (!form) return;
  e.preventDefault();
  const vstup = $('#nova-prednost', form);
  const text = vstup.value;
  vstup.value = '';
  pridejPrednost(form.dataset.zakazka, text);
});

/* Nová poznámka — Enter nebo tlačítko, ukáže se hned a uloží na pozadí. */
$('#ukol-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const vstup = $('#novy-ukol');
  const text = vstup.value.trim();
  if (!text) return vstup.focus();
  const polozka = {
    id: uid('u'), text, hotovo: false, zakazka: $('#novy-ukol-zakazka').value,
    kdo: JA.jmeno, role: JA.role, kdy: nyni(),
  };
  vstup.value = '';
  S.ukoly = [...S.ukoly, polozka];
  vykresliUkoly();
  const k = polozka.zakazka && najdi(polozka.zakazka);
  const ok = await uloz({ nadpis: k ? `Nová poznámka k ${k.nazev}` : 'Nová poznámka', detail: text }, SOUBOR_UKOLY,
    (dd) => { (dd.polozky = dd.polozky || []).push(polozka); });
  if (!ok) { vstup.value = text; synchronizuj(); }
});

/* Přetahování karet — jeden posluchač na celé ploše, karty se překreslují. */
let tazena = null;
const plocha = $('#plocha');
plocha.addEventListener('dragstart', (e) => {
  const karta = e.target.closest?.('.karta');
  if (!karta || UI.hledat) return e.preventDefault();
  tazena = karta.dataset.karta;
  karta.classList.add('tahne');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tazena);
});
plocha.addEventListener('dragover', (e) => {
  const karta = e.target.closest('.karta');
  if (!tazena || !karta) return;
  e.preventDefault();
  $$('.karta.cil', plocha).forEach((k) => k !== karta && k.classList.remove('cil'));
  if (karta.dataset.karta !== tazena) karta.classList.add('cil');
});
plocha.addEventListener('dragleave', (e) => {
  const karta = e.target.closest('.karta');
  if (karta && !karta.contains(e.relatedTarget)) karta.classList.remove('cil');
});
plocha.addEventListener('drop', (e) => {
  const karta = e.target.closest('.karta');
  if (!tazena || !karta) return;
  e.preventDefault();
  const id = tazena;
  tazena = null;
  presunZakazku(id, karta.dataset.karta);
});
plocha.addEventListener('dragend', () => {
  tazena = null;
  $$('.karta.tahne, .karta.cil', plocha).forEach((k) => k.classList.remove('tahne', 'cil'));
});

$('#btn-nova').addEventListener('click', novaZakazka);
$('#btn-obnovit').addEventListener('click', () => synchronizuj('nahlas'));

$('#btn-role').addEventListener('click', async () => {
  const v = await dialog({
    titulek: 'Podpis',
    popis: `Jsi přihlášený za ${JA.role === 'klient' ? KLIENT : 'studio'}. Pod tímhle jménem se podepisují komentáře.`,
    pole: [{ klic: 'jmeno', label: 'Jméno', hodnota: JA.jmeno }],
    okText: 'Uložit',
    navic: 'Odhlásit',
  });
  if (v?.navic) return odhlas();
  if (!v?.jmeno) return;
  JA.jmeno = v.jmeno.trim();
  pamet.pis(ulozKlic('jmeno'), JA.jmeno);
  $('#me-avatar').textContent = iniciely(JA.jmeno);
  vykresli();
});

/* Popisky stránky podle toho, čí je to kokpit. */
(() => {
  const dvojice = (a) => `${a}\u00a0× ${STUDIO.replace(/ /g, '\u00a0')}`;
  document.title = `Zakázky — ${KLIENT} × ${STUDIO}`;
  $('#zamek-dvojice').textContent = dvojice(KLIENT);
  $('#znacka-text').textContent = dvojice(CFG.klientKratce || KLIENT);
  $('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', CFG.klientKratce || 'Zakázky');
})();

/* obnovení sezení */
(async () => {
  if (!window.CFG?.blobs || !Object.values(CFG.blobs).some(Boolean)) {
    $('#zamek-chyba').textContent = 'Kokpit ještě nemá nastavený přístup. Spusť nastavení podle README.';
    $('#zamek-heslo').disabled = true;
    $('#zamek-btn').disabled = true;
    return;
  }
  try {
    const sez = JSON.parse(pamet.cti(ulozKlic('sez')) || 'null');
    const jmeno = pamet.cti(ulozKlic('jmeno'));
    if (!sez?.token || !jmeno) return;
    if (sez.otisk !== otiskKlicu()) {
      pamet.smaz(ulozKlic('sez'));
      $('#zamek-chyba').textContent = 'Přístupový klíč se změnil. Přihlas se prosím znovu.';
      return;
    }
    await spust(sez.token, sez.role, jmeno);
  } catch {}
})();
