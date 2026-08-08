# Zakázky — Chundela Reality × František Dron

Sdílená nástěnka zakázek. Obě strany vidí to samé a obě můžou psát:
studio i tým Jana Chundely. Běží zdarma na GitHub Pages, data leží
v privátním repu `frantisekdron/chundela-data`.

**Živě:** https://frantisekdron.github.io/chundela-kokpit/

## Co v tom je

Zakázka je **aktivní** nebo **hotová** a nese čtyři věci:

- odkaz na **fotky** a odkaz na **vizualizace** (plus libovolné další odkazy),
- **videa** — každé označené 16:9 pro Sreality nebo 9:16 pro reels, přehrají se přímo na stránce,
- **poznámku**,
- **komentáře** obou stran.

Obě strany můžou zakázku i video přidat, upravit i smazat.

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
