# Zakázky — Chundela Reality × František Dron

Sdílená nástěnka zakázek. Obě strany vidí to samé a obě můžou psát:
studio i tým Jana Chundely. Běží zdarma na GitHub Pages, data leží
v privátním repu `frantisekdron/chundela-data`.

**Živě:** https://frantisekdron.github.io/chundela-kokpit/

## Co v tom je

Nahoře je **Poznámky a úkoly** — společný seznam toho, co je potřeba
vyřešit. Každá položka jde odškrtnout a volitelně navázat na zakázku.

Pod tím jsou **zakázky** v pořadí, jaké si kdo přetáhne (na mobilu šipkami).
Zakázka je **aktivní** nebo **hotová** a nese:

- **popis** nahoře (víc řádků) a **adresa** s odkazem do Mapy.cz,
- **TOP přednosti** — štítky (bazén, les za plotem…); klik na štítek na kartě ukáže všechny zakázky se stejnou předností,
- **odkazy** — fotky, vizualizace, 3D prohlídka a libovolné další,
- **půdorysy** — nahrané soubory s náhledem,
- **nápady na scénář** — zvlášť pro Sreality, prodejní reels a zábavný reel,
- **videa** — 16:9 pro Sreality přes celou šířku, 9:16 reels vždy vedle sebe,
- **bannery** — nahrané soubory; první čtyři vidět, zbytek sbalený.

Ke **každé položce** jde napsat komentář (bublina vedle ní). Obě strany
můžou cokoliv přidat, upravit i smazat.

Půdorysy a bannery (obrázky i PDF) se nahrávají přímo do privátního repa
do složky `soubory/`, takže nikde nevisí veřejně — kokpit si je stahuje
přístupovým klíčem a ukazuje jako náhledy. Na soubor platí limit 10 MB.
Tlačítkem **Stáhnout vše** v hlavičce panelu se stáhnou všechny najednou
v jednom ZIPu (na iPhonu s kokpitem na ploše přes Sdílet → Uložit do Souborů).

V řadě se záložkami Aktivní / Hotové je **ceník** — sazby za natáčení,
fotky, reels, dotáčení a příplatky plus dodací podmínky. Řádky se dají
klikem upravit, přidat i smazat.

## E-mailový souhrn změn

Každý den v **9:00, 13:00 a 22:00** přijde na honza@frantisekdron.cz
souhrn toho, co se v kokpitu od minula změnilo — rozdělený podle zakázek,
s obsahem (text poznámky, komentáře, nápadu) a podpisem, kdo to udělal.
Když se nic nezměnilo, e-mail nepřijde.

Běží jako Google Apps Script pod frantisekdron@gmail.com (stejně jako
hlídač Poutníka), zdroj je `tools/notifikace/notifikace.gs`. Postup
nasazení je v hlavičce toho souboru. Google spouští v čase ± 15 minut.

Kokpit k tomu do každé změny zapisuje podpis (`Autor:`, `Zakázka:`),
samotné nahrávání souborů má `Souhrn: ne` — informaci nese zápis do
zakázky, takže se v e-mailu nic neopakuje.

## Jak to funguje

Stránka je statická, ale umí zapisovat: po zadání hesla se v prohlížeči
rozšifruje přístupový klíč ke GitHubu a aplikace pak čte a zapisuje
`data/zakazky.json` a `data/aktivita.json` v privátním repu.

- **Každá změna je commit.** V repu je vidět kdo, co a kdy, a jde se vrátit
  k jakékoliv starší verzi — i k smazané zakázce.
- **Dva lidi najednou si nepřepíšou práci.** Když někdo uloží mezitím,
  aplikace si stáhne jeho verzi a naši změnu na ni pustí znovu.
- **Nulové provozní náklady** a není co udržovat.

Dvě hesla — jedno pro studio, jedno pro Chundelu — otevírají to samé.
Liší se jen barvou podpisu u komentářů.

## Nastavení přístupu

1. Vyrob přístupový token na GitHubu:
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   - **Token name:** `kokpit-chundela`
   - **Expiration:** `No expiration` (nebo rok, pak se obnovuje)
   - **Repository access:** Only select repositories → `frantisekdron/chundela-data`
   - **Permissions** → Repository permissions → **Contents: Read and write**

2. Spusť nastavení a vlož token + dvě hesla:

   ```bash
   python3 nastav_pristup.py
   ```

Když token vyprší nebo ho někdo zruší, spusť to znovu. Hesla můžou zůstat stejná.

## Úpravy

Uprav `index.html`, `styles.css` nebo `app.js` a nasaď:

```bash
./nasadit.sh "co jsem změnil"
```

Data se tím netýkají — ta jsou v druhém repu a mění se přímo z aplikace.

| Soubor | K čemu |
|---|---|
| `index.html` | kostra stránky a ikony |
| `styles.css` | vizuální systém (zlatá a antracit ze značky Chundela Reality) |
| `app.js` | šifrování, vrstva nad GitHub API, vykreslování, akce |
| `config.js` | zašifrované přístupové klíče — generuje `nastav_pristup.py` |
| `vendor/morphdom.min.js` | knihovna, která při překreslení mění jen to, co se liší (kurzor, rozepsaný text i hrající video zůstanou) — MIT, licence vedle |
| `vendor/fflate.min.js` | balení ZIPu pro „Stáhnout vše" přímo v prohlížeči, načte se až po kliknutí — MIT, licence vedle |
| `tools/notifikace/notifikace.gs` | e-mailový souhrn změn (Google Apps Script), postup nasazení v hlavičce |

---

## Návod pro tým Chundela Reality

*(tuhle část můžeš přeposlat)*

Otevři **https://frantisekdron.github.io/chundela-kokpit/**, zadej heslo
a přidej si stránku na plochu telefonu. Heslo si prohlížeč pamatuje.

Nahoře přepínáš mezi **aktivními** a **hotovými** zakázkami. U každé jsou
rovnou na dlaždici tlačítka **Fotky** a **Vizualizace** — otevřou se jedním
klikem, nemusíš nikam chodit.

Klikem na zakázku se otevře detail: všechna videa se přehrají přímo tam,
ve tvaru, v jakém půjdou ven — na šířku pro Sreality, na výšku pro reels.
Pod nimi je místo na komentáře. Když má být na videu něco jinak, napiš čas
a co s ním, třeba „0:14 ubrat hudbu".

Zakázku, video i odkaz můžeš sám přidat, přepsat nebo smazat. Nic se
nemůže nenávratně ztratit — všechno je v historii.
