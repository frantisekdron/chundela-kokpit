# Produkční kokpit — Chundela Reality × František Dron

Sdílená nástěnka zakázek. Obě strany vidí to samé a obě můžou psát:
studio i tým Jana Chundely. Běží zdarma na GitHub Pages, data leží
v privátním repu `frantisekdron/chundela-data`.

**Živě:** https://frantisekdron.github.io/chundela-kokpit/

---

## Jak to funguje

Stránka je statická, ale umí zapisovat: po zadání hesla se v prohlížeči
rozšifruje přístupový klíč ke GitHubu a aplikace pak čte a zapisuje
`data/zakazky.json` a `data/aktivita.json` v privátním repu.

Z toho plyne pár příjemných věcí:

- **Každá změna je commit.** V repu je vidět kdo, co a kdy změnil, a jde
  se vrátit k jakékoliv starší verzi.
- **Nic se nedá nenávratně smazat.** Zakázka jde do koše, odkud se vrací.
  A i kdyby se smazala natvrdo, je v historii.
- **Dva lidi najednou si nepřepíšou práci.** Když někdo uloží mezitím,
  aplikace si stáhne jeho verzi a naši změnu na ni pustí znovu.
- **Nulové provozní náklady** a není co udržovat.

Dvě hesla — jedno pro studio, jedno pro Chundelu — otevírají to samé.
Liší se jen tím, pod jakou stranou se podepisuje, kdo co udělal, a jak
se počítá „čeká na nás / čeká na vás".

## První nastavení

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

3. Pošli Honzovi odkaz a jeho heslo. Hotovo.

## Úpravy kokpitu

Uprav `index.html`, `styles.css` nebo `app.js` a nasaď:

```bash
./nasadit.sh "co jsem změnil"
```

Data se tím netýkají — ta jsou v druhém repu a mění se přímo z aplikace.

## Výměna tokenu

Když token vyprší nebo ho někdo zruší, znovu spusť `nastav_pristup.py`.
Hesla můžou zůstat stejná, nebo je při té příležitosti změň — všem
najednou.

## Kde co je

| Soubor | K čemu |
|---|---|
| `index.html` | kostra stránky a ikony |
| `styles.css` | vizuální systém (zlatá a antracit ze značky Chundela Reality) |
| `app.js` | šifrování, vrstva nad GitHub API, vykreslování, akce |
| `config.js` | zašifrované přístupové klíče — generuje `nastav_pristup.py` |
| `seed/` | výchozí data, kterými se naplnil privátní repo (necommituje se) |

---

## Návod pro tým Chundela Reality

*(tuhle část můžeš přeposlat)*

Otevři **https://frantisekdron.github.io/chundela-kokpit/**, zadej heslo
a přidej si stránku na plochu telefonu. Heslo si prohlížeč pamatuje.

Nahoře je **volací list** — dva sloupce, co čeká na nás a co na vás.
Kliknutím na řádek se otevře konkrétní zakázka.

U každé zakázky najdeš odkaz na fotky, na vizualizace, na inzerát
a všechna videa. Videa se přehrají rovnou v kokpitu, ve stejném tvaru,
v jakém pak půjdou ven: na šířku pro Sreality, na výšku pro reels.

Když je video hotové, objeví se u něj **Schválit** a **Chci úpravy**.
U úprav napiš čas ve videu a co s ním — třeba „0:14 ubrat hudbu".
Připomínka nám hned naskočí do volacího listu.

Cokoliv dalšího napiš do komentářů dole u zakázky. Zakázku můžete
i sami založit, přidat úkol nebo doplnit odkaz.
