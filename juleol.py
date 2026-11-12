#!/usr/bin/env python3
"""Henter årets juleøl med lager i alle butikker fra Ølmonopolet og skriver site/data/juleol.json.

    python3 juleol.py                   # skriver site/data/juleol.json
    python3 juleol.py --ut annen.json

Ett kall mot API-et per kjøring. Bare standardbiblioteket, så det kjører med systemets python3.
"""
import argparse
import datetime
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.olmonopolet.app"
KATEGORIER = {"Øl", "Alkoholfritt"}  # mjød og sider hører ikke hjemme i en ølsmaking
FELT = ("vmp_id,vmp_name,main_category,sub_category,style,rating,checkins,abv,vmp_abv,"
        "volume,price,post_delivery,vmp_url,untpd_url,all_stock")
# Under dette er svaret halvt, og siden skal heller beholde gårsdagens data.
MIN_OL = 100
MIN_BUTIKKER = 300
NYTT_FORSOK_ETTER = 300  # sekunder
MAKS_SIDER = 3  # 1000 øl per side; flere sider enn dette betyr at noe er galt
# Lenker fra API-et havner på en offentlig side, så bare disse adressene slippes gjennom.
GYLDIGE_LENKER = {"polet": "https://www.vinmonopolet.no/", "untappd": "https://untappd.com/"}

# Rekkefølgen her avgjør hvilken gruppe et øl havner i: første treff vinner. «Lager - Winter» må treffe
# klassisk juleøl før det generelle «winter» i juleale.
GRUPPER = [
    ("Alkoholfritt", ["alkoholfri", "non-alcoholic"]),
    ("Surt og fruktig", ["sour", "lambic", "gueuze", "geuze", "gose", "wild ale",
                         "fruit beer", "kriek", "berliner", "surøl", "glühkriek"]),
    ("Humle og IPA", ["ipa", "pale ale", "india pale"]),
    ("Porter og stout", ["stout", "porter"]),
    ("Bokk", ["bock", "bokk"]),
    ("Belgisk", ["belgian", "quadrupel", "tripel", "dubbel", "abbey", "trappist",
                 "klosterstil"]),
    ("Sterk og fyldig", ["barleywine", "barley wine", "wheatwine", "old ale",
                         "old / stock", "scotch", "wee heavy", "strong ale"]),
    ("Klassisk juleøl", ["lager - winter", "lager - dark", "dunkel", "lager - amber",
                         "vienna", "märzen", "marzen", "schwarzbier", "rauchbier",
                         "mørk lager"]),
    ("Juleale og krydret", ["winter", "spiced", "herb", "brown", "red ale", "amber ale",
                            "bitter", "altbier", "scottish", "christmas", "red/amber"]),
    ("Gårdsøl og saison", ["farmhouse", "saison", "vossaøl", "kveik", "heimabrugg",
                           "bière de garde"]),
    ("Lys og frisk", ["lager", "pilsner", "pils", "helles", "kölsch", "wheat", "hefe",
                      "witbier", "weiss", "hveteøl", "blonde", "golden", "lys"]),
]

# Smakerekka går fra lett til tungt i denne rekkefølgen. Alkoholfritt og «Annet» er ikke med i rekka.
REKKEFOLGE = ["Surt og fruktig", "Lys og frisk", "Gårdsøl og saison", "Humle og IPA", "Klassisk juleøl",
              "Bokk", "Juleale og krydret", "Belgisk", "Sterk og fyldig", "Porter og stout"]


class HenteFeil(Exception):
    pass


def user_agent():
    repo = os.environ.get("REPO_URL")
    return f"olsmaking/1.0 (+{repo})" if repo else "olsmaking/1.0 (lokal kjøring)"


class IngenOmdirigering(urllib.request.HTTPRedirectHandler):
    """urllib sender egne headere videre ved omdirigering, også nøkkelen til en annen vert."""

    def redirect_request(self, *args, **kwargs):
        return None


_apne = urllib.request.build_opener(IngenOmdirigering).open


def hent_json(url, pause=NYTT_FORSOK_ETTER):
    headers = {"User-Agent": user_agent(), "Accept": "application/json"}
    nokkel = os.environ.get("OLMONOPOLET_API_KEY")
    if nokkel:
        headers["X-API-Key"] = nokkel
    for forsok in (1, 2):
        try:
            with _apne(urllib.request.Request(url, headers=headers), timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise HenteFeil(f"Ølmonopolet svarer {e.code}. API-et krever trolig nøkkel nå: "
                                "legg den i OLMONOPOLET_API_KEY.") from e
            if not (e.code == 429 or e.code >= 500) or forsok == 2:
                raise HenteFeil(f"Ølmonopolet svarer {e.code}.") from e
        # Tidsavbrudd, brutt forbindelse midt i svaret, eller et svar som ikke er JSON.
        except (OSError, http.client.HTTPException, ValueError) as e:
            if forsok == 2:
                raise HenteFeil(f"Fikk ikke et brukbart svar fra Ølmonopolet: {e!r}") from e
        print(f"Prøver igjen om {pause} sekunder …", file=sys.stderr)
        time.sleep(pause)


def hent_juleol(pause=NYTT_FORSOK_ETTER):
    params = {"is_christmas_beer": "true", "active": "true", "all_stock": "true",
              "page_size": 1000, "fields": FELT}
    url = f"{API}/beers/?" + urllib.parse.urlencode(params)
    resultater = []
    for _ in range(MAKS_SIDER):
        d = hent_json(url, pause)
        resultater += d.get("results") or []
        # Neste side kommer bare hvis det blir over 1000 juleøl. API-et oppgir den med http.
        url = (d.get("next") or "").replace("http://", "https://", 1)
        if not url:
            return resultater
        if not url.startswith(API + "/"):
            raise HenteFeil(f"Neste side peker utenfor API-et: {url}")
    raise HenteFeil(f"Mer enn {MAKS_SIDER} sider i svaret.")


def lenke(url, type_):
    return url if (url or "").startswith(GYLDIGE_LENKER[type_]) else ""


def gruppe(o):
    if o.get("main_category") == "Alkoholfritt":
        return "Alkoholfritt"
    for tekst in (o.get("style") or "", o.get("sub_category") or ""):
        t = tekst.lower()
        for navn, nokler in GRUPPER:
            if any(n in t for n in nokler):
                return navn
    return "Annet"


def bygg_data(resultater, hentet):
    """Gjør API-svaret om til det siden trenger, og stopper hvis svaret er tomt eller halvt."""
    ol = [o for o in resultater if o.get("main_category") in KATEGORIER]
    butikker = sorted({s["store_name"] for o in ol for s in (o.get("all_stock") or [])
                       if (s.get("quantity") or 0) > 0})
    if len(ol) < MIN_OL:
        raise HenteFeil(f"Bare {len(ol)} juleøl i svaret, venter minst {MIN_OL}.")
    if len(butikker) < MIN_BUTIKKER:
        raise HenteFeil(f"Bare {len(butikker)} butikker i svaret, venter minst {MIN_BUTIKKER}.")
    indeks = {navn: i for i, navn in enumerate(butikker)}

    return {
        "hentet": hentet,
        "kilde": "https://www.olmonopolet.app",
        "rekkefolge": REKKEFOLGE,
        "butikker": butikker,
        "ol": [{
            "id": str(o["vmp_id"]),
            "navn": o.get("vmp_name") or "",
            "gruppe": gruppe(o),
            "stil": o.get("style") or o.get("sub_category") or "",
            "score": round(o["rating"], 3) if o.get("rating") else None,
            "innsjekker": int(o.get("checkins") or 0),
            # abv kommer fra Untappd og mangler for øl som ikke er koblet ennå.
            "alkohol": o.get("abv") or o.get("vmp_abv") or 0.0,
            "cl": round((o.get("volume") or 0) * 100, 1),
            "pris": o.get("price") or 0.0,
            "nett": bool(o.get("post_delivery")),
            "polet": lenke(o.get("vmp_url"), "polet"),
            "untappd": lenke(o.get("untpd_url"), "untappd"),
            # Nøkkelen er plassen i «butikker», så fila holder seg liten.
            "lager": {str(indeks[s["store_name"]]): s["quantity"] for s in (o.get("all_stock") or [])
                      if (s.get("quantity") or 0) > 0},
        } for o in ol],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--ut", default="site/data/juleol.json", help="hvor fila skrives")
    a = ap.parse_args()

    hentet = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    try:
        data = bygg_data(hent_juleol(), hentet)
    except HenteFeil as e:
        sys.exit(f"Feil: {e} Fila er ikke endret.")

    os.makedirs(os.path.dirname(a.ut) or ".", exist_ok=True)
    tmp = a.ut + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, a.ut)  # siden skal aldri se en halvskrevet fil
    print(f"{len(data['ol'])} juleøl i {len(data['butikker'])} butikker, "
          f"{os.path.getsize(a.ut) / 1e6:.2f} MB → {a.ut}")


if __name__ == "__main__":
    main()
