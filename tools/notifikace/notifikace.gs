/**
 * Zakázky Chundela × František Dron — e-mailový souhrn změn (14. 10. 2026).
 *
 * Každý den v 9:00, 13:00 a 22:00 (± 15 minut, víc Google nezaručí) se podívá
 * do historie dat kokpitu. Každá změna v kokpitu je commit v privátním repu
 * frantisekdron/chundela-data a kokpit do něj píše, co se stalo, s jakým
 * obsahem a kdo to udělal. Když od minulého souhrnu žádná změna nepřibyla,
 * e-mail se neposílá.
 *
 * Proč Apps Script a ne GitHub Actions: plánované běhy GitHubu se v praxi
 * zpožďují o hodiny (viz hlídač Poutníka), tady jde o přesné časy.
 *
 * NASAZENÍ (jednou, ~3 minuty):
 *  1. github.com/settings/personal-access-tokens/new → klíč „kokpit-notifikace“,
 *     Resource owner frantisekdron, Expiration → No expiration (výchozích 30 dní
 *     by souhrny po měsíci zastavilo), Only select repositories → chundela-data,
 *     Repository permissions → Contents: Read-only. Zkopírovat (github_pat_…).
 *  2. script.google.com pod frantisekdron@gmail.com → Nový projekt
 *     „Zakázky Chundela – souhrn změn“ → vložit celý tenhle soubor jako Kód.gs → Uložit.
 *  3. Vlevo ozubené kolečko (Nastavení projektu) → dole Vlastnosti skriptu →
 *     Přidat vlastnost: GITHUB_TOKEN = klíč z kroku 1 → Uložit.
 *  4. Nahoře vybrat funkci `nastav` → Spustit → povolit (e-maily, externí služba,
 *     spouštěče). Tím vzniknou tři denní spouštěče a výchozí bod = teď.
 *  5. Volitelně `zkusebniSouhrn` → pošle ukázku z posledních změn hned.
 *
 * Zdroj pravdy je tenhle soubor v repu chundela-kokpit (tools/notifikace/),
 * v editoru Apps Scriptu ho jen přepisovat celý.
 */

const SOUHRN = {
  prijemce: 'honza@frantisekdron.cz',
  repo: 'frantisekdron/chundela-data',
  vetev: 'main',
  kokpit: 'https://frantisekdron.github.io/chundela-kokpit/',
  hodiny: [9, 13, 22],
  zona: 'Europe/Prague',
  // Strop pro jeden e-mail — při běžném provozu je změn za pár hodin desítky.
  maxZmen: 300,
};

/* ------------------------------------------------------------------ nastavení */

/** Spustit jednou ručně: tři denní spouštěče + výchozí bod „teď“. */
function nastav() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'odesliSouhrn')
    .forEach((t) => ScriptApp.deleteTrigger(t));

  SOUHRN.hodiny.forEach((h) => {
    ScriptApp.newTrigger('odesliSouhrn')
      .timeBased().everyDays(1).atHour(h).nearMinute(0).inTimezone(SOUHRN.zona)
      .create();
  });

  const hlava = hlava_();  // zároveň ověří, že klíč funguje
  PropertiesService.getScriptProperties().setProperties({
    posledniSha: hlava,
    posledniSouhrn: new Date().toISOString(),
    chyba: '',
  });
  Logger.log(`Hotovo: souhrn chodí v ${SOUHRN.hodiny.join(':00, ')}:00 na ${SOUHRN.prijemce}. Výchozí bod ${hlava.slice(0, 7)}.`);
}

/* ------------------------------------------------------------------ souhrn */

/** Volají spouštěče v 9, 13 a 22 h. */
function odesliSouhrn() {
  const vlastnosti = PropertiesService.getScriptProperties();
  try {
    const posledni = vlastnosti.getProperty('posledniSha');
    const hlava = hlava_();

    if (!posledni) {  // bez výchozího bodu by první e-mail nesl celou historii
      vlastnosti.setProperties({ posledniSha: hlava, posledniSouhrn: new Date().toISOString() });
      return;
    }
    if (hlava === posledni) return vycistiChybu_(vlastnosti);  // nic nového → žádný e-mail

    const rozdil = commityOd_(posledni, hlava);
    if (!rozdil) {
      // Starý bod v historii zmizel (přepsaná historie). Začneme znovu od teď.
      vlastnosti.setProperties({ posledniSha: hlava, posledniSouhrn: new Date().toISOString() });
      return vycistiChybu_(vlastnosti);
    }

    const zmeny = rozdil.commity.map(rozeber_).filter((z) => z.doSouhrnu);
    if (zmeny.length) {
      posli_(zmeny, {
        od: new Date(vlastnosti.getProperty('posledniSouhrn') || Date.now()),
        preteceni: rozdil.celkem > rozdil.commity.length,
      });
    }
    vlastnosti.setProperties({ posledniSha: hlava, posledniSouhrn: new Date().toISOString() });
    vycistiChybu_(vlastnosti);
  } catch (e) {
    ohlasChybu_(vlastnosti, e);
    throw e;  // ať o tom ví i přehled spouštěčů v Apps Scriptu
  }
}

/** Ruční zkouška: pošle souhrn posledních změn hned, výchozí bod nemění. */
function zkusebniSouhrn() {
  const commity = gh_(`/repos/${SOUHRN.repo}/commits?sha=${SOUHRN.vetev}&per_page=20`).reverse();
  const zmeny = commity.map(rozeber_).filter((z) => z.doSouhrnu);
  if (!zmeny.length) return Logger.log('V posledních 20 commitech není nic do souhrnu.');
  posli_(zmeny, { od: zmeny[0].kdy, zkusebni: true });
  Logger.log(`Odesláno ${zmeny.length} změn na ${SOUHRN.prijemce}.`);
}

/* ------------------------------------------------------------------ GitHub */

function gh_(cesta, { chybiJeNull = false } = {}) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Chybí GITHUB_TOKEN ve Vlastnostech skriptu (Nastavení projektu → Vlastnosti skriptu).');
  const r = UrlFetchApp.fetch('https://api.github.com' + cesta, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    muteHttpExceptions: true,
  });
  const kod = r.getResponseCode();
  if (kod === 404 && chybiJeNull) return null;
  if (kod === 401) throw new Error('Klíč ke GitHubu vypršel nebo byl zrušen — vyrob nový a vlož ho do GITHUB_TOKEN.');
  if (kod === 403 || kod === 404) throw new Error(`Klíč nevidí repozitář ${SOUHRN.repo} — zkontroluj Repository access a Contents: Read-only.`);
  if (kod >= 300) throw new Error(`GitHub vrátil ${kod}: ${r.getContentText().slice(0, 200)}`);
  return JSON.parse(r.getContentText());
}

const hlava_ = () => gh_(`/repos/${SOUHRN.repo}/branches/${SOUHRN.vetev}`).commit.sha;

/** Commity mezi dvěma body, od nejstaršího. null = starý bod už v historii není. */
function commityOd_(od, po) {
  const commity = [];
  let celkem = 0;
  for (let strana = 1; commity.length < SOUHRN.maxZmen; strana++) {
    const r = gh_(`/repos/${SOUHRN.repo}/compare/${od}...${po}?per_page=100&page=${strana}`, { chybiJeNull: true });
    if (!r) return null;
    celkem = r.total_commits || 0;
    commity.push(...(r.commits || []));
    if (!r.commits || r.commits.length < 100 || commity.length >= celkem) break;
  }
  return { commity: commity.slice(0, SOUHRN.maxZmen), celkem };
}

/* ------------------------------------------------------------------ rozbor commitu */

/**
 * Kokpit píše zprávy ve tvaru:
 *   Babice (26-07) — komentář: Fotky
 *
 *   Fotky jsou v Lightroomu, výběr pošleme do pátku.
 *
 *   Autor: Franta (studio)
 *   Zakázka: Babice (26-07)
 *   Zakázka-id: z-babice
 * Skupina se řídí stálým „Zakázka-id“ (přežije přejmenování i doplnění ID),
 * jméno skupiny je štítek z nejnovější změny. Název zakázky může obsahovat
 * pomlčku, proto se nadpis neřeže naslepo. Starší commity podpis ani obsah
 * nemají — i ty se ukážou, jen bez nich.
 */
function rozeber_(c) {
  const odstavce = String(c.commit.message || '').replace(/\r/g, '').split(/\n\s*\n/);
  const nadpis = (odstavce.shift() || '').trim();

  const podpis = {};
  const posledni = odstavce[odstavce.length - 1] || '';
  if (posledni && posledni.split('\n').every((r) => /^(Autor|Souhrn|Zakázka|Zakázka-id):\s/.test(r.trim()))) {
    odstavce.pop();
    posledni.split('\n').forEach((r) => {
      const i = r.indexOf(':');
      podpis[r.slice(0, i).trim()] = r.slice(i + 1).trim();
    });
  }

  const srovnej = (x) => String(x || '').replace(/\s+/g, ' ').trim();
  const zakazka = srovnej(podpis['Zakázka']);
  const zakazkaId = podpis['Zakázka-id'] || '';
  const titul = srovnej(nadpis);
  const pevna = pevnaSkupina_(titul);
  let co = titul;
  if (zakazka && titul.startsWith(zakazka + ' — ')) co = titul.slice(zakazka.length + 3);
  else if (pevna === 'Ceník' && titul.startsWith('Ceník — ')) co = titul.slice(8);
  else if (!zakazka && !pevna && titul.indexOf(' — ') > 0) co = titul.slice(titul.indexOf(' — ') + 3);  // starší commity

  return {
    sha: c.sha,
    kdy: new Date(c.commit.committer.date),
    klic: zakazkaId ? 'id:' + zakazkaId : 'sk:' + (zakazka || pevna || legacySkupina_(titul)),
    skupina: zakazka || pevna || legacySkupina_(titul),
    co,
    detail: odstavce.join('\n\n').trim(),
    autor: podpis.Autor || '',
    // Úklid po testech dřív podpis neměl; s podpisem rozhoduje jen řádek Souhrn.
    doSouhrnu: podpis.Souhrn !== 'ne' && !(!podpis.Autor && /^Úklid/.test(titul)),
  };
}

/** Skupiny, které nejsou konkrétní zakázka — poznávají se podle začátku nadpisu. */
function pevnaSkupina_(titul) {
  if (/^(Nová poznámka|Upravená poznámka|Smazaná poznámka|Úkol )/.test(titul)) return 'Poznámky a úkoly';
  if (/^(Nová zakázka|Smazána zakázka|Pořadí zakázek)/.test(titul)) return 'Zakázky';
  if (/^Ceník\b/.test(titul)) return 'Ceník';
  return '';
}

/** Starší commity bez podpisu: zakázka je před první pomlčkou. */
function legacySkupina_(titul) {
  const i = titul.indexOf(' — ');
  return i > 0 ? titul.slice(0, i) : 'Ostatní';
}

/* ------------------------------------------------------------------ e-mail */

/* Google pustí e-mail z Apps Scriptu jen do 200 KB těla. Necháváme rezervu,
   jinak by velký souhrn selhal pořád dokola a bod by se nikdy neposunul. */
const ROZPOCET_BAJTU = 140 * 1024;
const bajty_ = (s) => encodeURIComponent(s).replace(/%[0-9A-F]{2}/g, 'x').length;
const zmen_ = (n) => `${n} ${n === 1 ? 'změna' : n >= 2 && n <= 4 ? 'změny' : 'změn'}`;

function posli_(zmeny, { od, preteceni = false, zkusebni = false }) {
  const odKdy = kdyKratce_(od);
  const predmet = `${zkusebni ? '[zkouška] ' : ''}Zakázky Chundela: ${zmen_(zmeny.length)} od ${odKdy}`;
  const zaklad = { to: SOUHRN.prijemce, subject: predmet, name: 'Zakázky Chundela' };

  // 1) celé, 2) bez textů u změn, 3) bez textů a jen tolik změn, kolik se vejde
  let verze = null;
  for (const bezTextu of [false, true]) {
    for (let n = zmeny.length; n > 0; n = Math.floor(n * 0.8)) {
      const vybrane = zmeny.slice(0, n);
      const o = { celkem: zmeny.length, zobrazeno: n, odKdy, bezTextu, preteceni };
      const skupiny = seskup_(bezTextu ? vybrane.map((z) => ({ ...z, detail: '' })) : vybrane);
      const html = html_(skupiny, o), text = text_(skupiny, o);
      if (bajty_(html) + bajty_(text) <= ROZPOCET_BAJTU) { verze = { html, text }; break; }
      if (!bezTextu) break;  // s texty nezkracujeme — radši nejdřív zahodit texty
    }
    if (verze) break;
  }
  if (!verze) verze = { text: `${zmen_(zmeny.length)} od ${odKdy} — je jich tolik, že se nevejdou do e-mailu.\n\nKokpit: ${SOUHRN.kokpit}` };

  try {
    MailApp.sendEmail({ ...zaklad, body: verze.text, ...(verze.html ? { htmlBody: verze.html } : {}) });
  } catch (e) {
    // Poslední pokus: holý text bez HTML, ať se bod posune a chyba se neopakuje.
    MailApp.sendEmail({ ...zaklad, body: `${zmen_(zmeny.length)} od ${odKdy}. Plný souhrn se nepodařilo odeslat (${e.message}).\n\nKokpit: ${SOUHRN.kokpit}` });
  }
}

/** Skupiny podle zakázky (stálý klíč, jméno z nejnovější změny);
    v každé po sobě jdoucí stejné změny sloučené („3×“). */
function seskup_(zmeny) {
  const skupiny = new Map();
  zmeny.forEach((z) => {
    if (!skupiny.has(z.klic)) skupiny.set(z.klic, { nazev: z.skupina, zmeny: [] });
    const s = skupiny.get(z.klic);
    s.nazev = z.skupina;  // změny jdou od nejstarší, takže vyhraje nejnovější jméno
    const predchozi = s.zmeny[s.zmeny.length - 1];
    if (predchozi && predchozi.co === z.co && predchozi.detail === z.detail && predchozi.autor === z.autor) {
      predchozi.krat++;
      predchozi.kdy = z.kdy;
    } else {
      s.zmeny.push({ ...z, krat: 1 });
    }
  });
  // Poznámky navrch, pak zakázky v pořadí první změny, Ceník / Zakázky / Ostatní nakonec.
  // Jen skupiny bez stálého id — zakázka, která se náhodou jmenuje „Ceník“, zůstane mezi zakázkami.
  const nakonec = ['Ceník', 'Zakázky', 'Ostatní'];
  const vaha = (s) => {
    if (s.zmeny[0].klic.startsWith('id:')) return 0;
    if (s.nazev === 'Poznámky a úkoly') return -1;
    return nakonec.includes(s.nazev) ? 10 + nakonec.indexOf(s.nazev) : 0;
  };
  return [...skupiny.values()].map((s, i) => ({ ...s, i })).sort((a, b) => vaha(a) - vaha(b) || a.i - b.i);
}

function poznamkaOVynechani_({ celkem, zobrazeno, bezTextu, preteceni }) {
  const v = [];
  if (bezTextu) v.push('Souhrn je dlouhý, texty u změn jsou vynechané — celé je najdeš v kokpitu.');
  if (zobrazeno < celkem) v.push(`…a ${zmen_(celkem - zobrazeno).replace(/^(\d+)/, 'dalších $1')}, které se do e-mailu nevešly.`);
  if (preteceni) v.push('Změn bylo víc, než souhrn naráz zpracuje — novější najdeš v kokpitu.');
  return v;
}

function text_(skupiny, o) {
  const radky = [`${zmen_(o.celkem)} v kokpitu od ${o.odKdy}.`, ''];
  skupiny.forEach((s) => {
    radky.push(s.nazev.toUpperCase());
    s.zmeny.forEach((z) => {
      radky.push(`  ${cas_(z.kdy)}  ${z.co}${z.krat > 1 ? ` (${z.krat}×)` : ''}${z.autor ? ` — ${z.autor}` : ''}`);
      if (z.detail) radky.push(...z.detail.split('\n').map((r) => `         ${r}`));
    });
    radky.push('');
  });
  poznamkaOVynechani_(o).forEach((v) => radky.push(v));
  radky.push('', `Kokpit: ${SOUHRN.kokpit}`);
  return radky.join('\n');
}

function html_(skupiny, o) {
  const zlata = '#b8995c', tma = '#14120f', sede = '#7a726a', linka = '#e8e1d5';
  const skupinaHtml = (s) => `
    <tr><td style="padding:22px 0 6px;font:700 12px/1.2 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${tma};border-bottom:2px solid ${zlata}">
      ${esc_(s.nazev)}
    </td></tr>
    ${s.zmeny.map((z) => `
    <tr><td style="padding:10px 0;border-bottom:1px solid ${linka}">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td valign="top" style="width:52px;font:12px/1.5 Menlo,Consolas,monospace;color:${sede}">${cas_(z.kdy)}</td>
        <td valign="top" style="font:14px/1.5 Arial,sans-serif;color:${tma}">
          <b style="font-weight:600">${esc_(z.co)}</b>${z.krat > 1 ? ` <span style="color:${sede}">(${z.krat}×)</span>` : ''}
          ${z.detail ? `<div style="margin:6px 0 2px;padding:6px 10px;border-left:3px solid ${zlata};background:#faf6ee;color:#3d3937;white-space:pre-wrap">${esc_(z.detail)}</div>` : ''}
          ${z.autor ? `<div style="font:11px/1.4 Arial,sans-serif;color:${sede};margin-top:2px">${esc_(z.autor)}</div>` : ''}
        </td>
      </tr></table>
    </td></tr>`).join('')}`;

  return `
<div style="background:#f4f1ec;padding:24px 12px">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">
    <tr><td style="background:${tma};padding:18px 24px">
      <div style="font:700 11px/1.2 Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#d2ba8a">Zakázky Chundela × František Dron</div>
      <div style="font:700 21px/1.3 Arial,sans-serif;color:#ffffff;margin-top:6px">${zmen_(o.celkem)} od ${esc_(o.odKdy)}</div>
    </td></tr>
    <tr><td style="padding:2px 24px 22px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${skupiny.map(skupinaHtml).join('')}
      </table>
      ${poznamkaOVynechani_(o).map((v) => `<p style="font:13px/1.5 Arial,sans-serif;color:${sede};margin:14px 0 0">${esc_(v)}</p>`).join('')}
      <p style="margin:24px 0 0"><a href="${SOUHRN.kokpit}" style="display:inline-block;background:#d2ba8a;color:${tma};font:700 14px/1 Arial,sans-serif;text-decoration:none;padding:12px 20px;border-radius:7px">Otevřít kokpit</a></p>
    </td></tr>
  </table>
  <p style="text-align:center;font:11px/1.5 Arial,sans-serif;color:${sede};margin:14px 0 0">Souhrn chodí v 9, 13 a 22 h, jen když se od minula něco změnilo.</p>
</div>`;
}

/* ------------------------------------------------------------------ chyby */

/** Při chybě pošle jedno varování — ne třikrát denně to samé. */
function ohlasChybu_(vlastnosti, e) {
  const zprava = String(e && e.message || e);
  if (vlastnosti.getProperty('chyba') === zprava) return;
  vlastnosti.setProperty('chyba', zprava);
  MailApp.sendEmail({
    to: SOUHRN.prijemce,
    subject: '⚠️ Souhrn změn kokpitu Chundela se nepodařilo odeslat',
    name: 'Zakázky Chundela',
    body: `${zprava}\n\nSouhrn se zkusí znovu v příštím termínu. Tohle varování přijde jen jednou, dokud se chyba nezmění.\n\nNastavení: script.google.com → projekt „Zakázky Chundela – souhrn změn“.`,
  });
}

function vycistiChybu_(vlastnosti) {
  if (vlastnosti.getProperty('chyba')) vlastnosti.setProperty('chyba', '');
}

/* ------------------------------------------------------------------ drobnosti */

const cas_ = (d) => Utilities.formatDate(d, SOUHRN.zona, 'H:mm');

/** „9:00“, když je to dnes, jinak „13. 10. 22:00“. */
function kdyKratce_(d) {
  const den = (x) => Utilities.formatDate(x, SOUHRN.zona, 'yyyy-MM-dd');
  return den(d) === den(new Date()) ? cas_(d) : Utilities.formatDate(d, SOUHRN.zona, 'd. M. H:mm');
}

const esc_ = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
