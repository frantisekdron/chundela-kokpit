#!/usr/bin/env python3
"""
Nastavení přístupu do kokpitu.

Zeptá se na přístupový token z GitHubu a na dvě hesla — jedno pro naše
studio, druhé pro tým Chundela Reality. Token zašifruje oběma hesly
a výsledek zapíše do config.js. Token se nikam jinam neukládá a bez
hesla se z config.js nedá přečíst.

Spuštění:  python3 nastav_pristup.py
"""

import base64
import getpass
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    sys.exit("Chybí knihovna cryptography. Nainstaluj ji:  pip3 install cryptography")

ITERACE = 600_000
KOREN = Path(__file__).resolve().parent
CONFIG = KOREN / "config.js"


def zasifruj(text: str, heslo: str) -> str:
    """sůl(16) + iv(12) + šifra — přesně jak to čte prohlížeč ve WebCrypto."""
    sul = os.urandom(16)
    iv = os.urandom(12)
    klic = hashlib.pbkdf2_hmac("sha256", heslo.encode("utf-8"), sul, ITERACE, 32)
    sifra = AESGCM(klic).encrypt(iv, text.encode("utf-8"), None)
    return base64.b64encode(sul + iv + sifra).decode("ascii")


def nacti_nastaveni() -> dict:
    """Z config.js vykousne objekt mezi prvni { a posledni } - je to platny JSON."""
    text = CONFIG.read_text(encoding="utf-8")
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def zeptej_se_na_heslo(pro_koho: str) -> str:
    while True:
        a = getpass.getpass(f"Heslo pro {pro_koho}: ")
        if len(a) < 10:
            print("   Aspoň 10 znaků, prosím. Tímhle heslem je chráněný přístup k datům.")
            continue
        b = getpass.getpass("   Ještě jednou pro kontrolu: ")
        if a != b:
            print("   Hesla se neshodují, zkus to znovu.")
            continue
        return a


def main() -> None:
    print("\n  NASTAVENÍ PŘÍSTUPU DO KOKPITU")
    print("  " + "-" * 46)
    print("""
  Potřebuješ přístupový token z GitHubu. Vyrobíš ho tady:

    github.com/settings/personal-access-tokens/new

    Token name .... kokpit-chundela
    Expiration .... No expiration  (nebo 1 rok, pak se obnovuje)
    Repository access ... Only select repositories → frantisekdron/chundela-data
    Permissions → Repository permissions → Contents → Read and write

  Pak klikni Generate token a zkopíruj ho (začíná github_pat_).
""")

    token = getpass.getpass("  Vlož token (nebude vidět): ").strip()
    if not token.startswith(("github_pat_", "ghp_")):
        sys.exit("  To nevypadá jako GitHub token. Má začínat github_pat_ nebo ghp_.")

    print("\n  Teď dvě hesla. Každá strana dostane to svoje.")
    print("  (Obě otevírají to samé — liší se jen podpisem u změn.)\n")
    heslo_studio = zeptej_se_na_heslo("naše studio")
    heslo_klient = zeptej_se_na_heslo("tým Chundela Reality")

    if heslo_studio == heslo_klient:
        sys.exit("  Hesla musí být různá, jinak nepoznáme, kdo je kdo.")

    print("\n  Šifruji (chvilku to trvá, je to schválně pomalé)…")
    nastaveni = nacti_nastaveni()
    nastaveni["iterace"] = ITERACE
    nastaveni["blobs"] = {
        "studio": zasifruj(token, heslo_studio),
        "klient": zasifruj(token, heslo_klient),
    }

    CONFIG.write_text(
        "/* Nastaveni kokpitu.\n"
        "   Blobs jsou pristupove klice zasifrovane heslem - vygeneruje je\n"
        "   `python3 nastav_pristup.py`. Bez hesla se z nich nic neprecte. */\n"
        "window.CFG = " + json.dumps(nastaveni, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"  Hotovo, zapsáno do {CONFIG.name}.")

    if input("\n  Nasadit rovnou na web? [a/n] ").strip().lower() in ("a", "ano", "y", ""):
        subprocess.run(["bash", str(KOREN / "nasadit.sh")], check=False)
    else:
        print("  Až budeš chtít, spusť:  ./nasadit.sh")


if __name__ == "__main__":
    main()
