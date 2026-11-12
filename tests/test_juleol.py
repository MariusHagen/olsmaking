"""Hentejobben, testet med konstruerte svar. Ingen kall mot API-et."""
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

import juleol


def ol(nr, butikker, kategori="Øl", stil="Winter Ale", lager=5):
    return {"vmp_id": nr, "vmp_name": f"Øl {nr}", "main_category": kategori, "sub_category": None,
            "style": stil, "rating": 3.7, "checkins": 100, "abv": 8.0, "vmp_abv": 8.0, "volume": 0.33,
            "price": 59.9, "post_delivery": nr % 2 == 0, "vmp_url": f"https://www.vinmonopolet.no/p/{nr}",
            "untpd_url": "", "all_stock": [{"store_name": b, "quantity": lager} for b in butikker]}


def svar_med(antall_ol=150, antall_butikker=320):
    butikker = [f"By {i}, Butikk {i}" for i in range(antall_butikker)]
    return [ol(i, butikker) for i in range(antall_ol)]


class Svar(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def json_svar(results, neste=None):
    return Svar(json.dumps({"results": results, "next": neste}).encode())


def http_feil(kode):
    return urllib.error.HTTPError("https://api.olmonopolet.app/beers/", kode, "feil", {}, None)


def apne(**kw):
    return mock.patch("juleol._apne", **kw)


class Henting(unittest.TestCase):
    def test_401_og_403_betyr_nokkel_og_proves_ikke_igjen(self):
        for kode in (401, 403):
            with apne(side_effect=[http_feil(kode), json_svar([])]) as kall:
                with self.assertRaisesRegex(juleol.HenteFeil, "OLMONOPOLET_API_KEY"):
                    juleol.hent_juleol(pause=0)
            self.assertEqual(kall.call_count, 1, kode)

    def test_404_proves_ikke_igjen(self):
        with apne(side_effect=[http_feil(404), json_svar([])]) as kall:
            with self.assertRaises(juleol.HenteFeil):
                juleol.hent_juleol(pause=0)
        self.assertEqual(kall.call_count, 1)

    def test_429_serverfeil_tidsavbrudd_og_odelagt_svar_proves_en_gang_til(self):
        for feil in (http_feil(429), http_feil(502), TimeoutError(), ConnectionResetError(), Svar(b"<html>")):
            with apne(side_effect=[feil, json_svar(svar_med())]) as kall:
                self.assertEqual(len(juleol.hent_juleol(pause=0)), 150, repr(feil))
            self.assertEqual(kall.call_count, 2, repr(feil))

    def test_feil_to_ganger_gir_hentefeil(self):
        with apne(side_effect=[http_feil(502), http_feil(502), json_svar([])]) as kall:
            with self.assertRaises(juleol.HenteFeil):
                juleol.hent_juleol(pause=0)
        self.assertEqual(kall.call_count, 2)

    def test_neste_side_utenfor_api_et_folges_ikke(self):
        with apne(side_effect=[json_svar([], neste="https://annen.example/beers/?page=2")]) as kall:
            with self.assertRaisesRegex(juleol.HenteFeil, "utenfor"):
                juleol.hent_juleol(pause=0)
        self.assertEqual(kall.call_count, 1)

    def test_sider_i_ring_stopper(self):
        neste = "http://api.olmonopolet.app/beers/?page=2"
        with apne(side_effect=lambda *a, **k: json_svar([], neste=neste)) as kall:
            with self.assertRaisesRegex(juleol.HenteFeil, "sider"):
                juleol.hent_juleol(pause=0)
        self.assertEqual(kall.call_count, juleol.MAKS_SIDER)

    def test_nokkel_sendes_bare_nar_den_finnes(self):
        with mock.patch.dict(os.environ, {"OLMONOPOLET_API_KEY": "hemmelig"}), apne(return_value=json_svar([])) as kall:
            juleol.hent_juleol(pause=0)
        foresporsel = kall.call_args[0][0]
        self.assertEqual(foresporsel.get_header("X-api-key"), "hemmelig")
        self.assertNotIn("hemmelig", foresporsel.get_header("User-agent"))
        uten = {k: v for k, v in os.environ.items() if k != "OLMONOPOLET_API_KEY"}
        with mock.patch.dict(os.environ, uten, clear=True), apne(return_value=json_svar([])) as kall:
            juleol.hent_juleol(pause=0)
        self.assertIsNone(kall.call_args[0][0].get_header("X-api-key"))

    def test_fila_er_uendret_nar_hentingen_feiler(self):
        with tempfile.TemporaryDirectory() as mappe:
            fil = os.path.join(mappe, "juleol.json")
            with open(fil, "w", encoding="utf-8") as f:
                f.write('{"gammel": true}')
            with mock.patch.object(sys, "argv", ["juleol.py", "--ut", fil]), apne(side_effect=http_feil(403)):
                with self.assertRaises(SystemExit):
                    juleol.main()
            with open(fil, encoding="utf-8") as f:
                self.assertEqual(f.read(), '{"gammel": true}')


class Bygging(unittest.TestCase):
    def test_grensene_for_halve_svar(self):
        with self.assertRaisesRegex(juleol.HenteFeil, "juleøl"):
            juleol.bygg_data(svar_med(antall_ol=juleol.MIN_OL - 1), "x")
        juleol.bygg_data(svar_med(antall_ol=juleol.MIN_OL), "x")
        with self.assertRaisesRegex(juleol.HenteFeil, "butikker"):
            juleol.bygg_data(svar_med(antall_butikker=juleol.MIN_BUTIKKER - 1), "x")
        juleol.bygg_data(svar_med(antall_butikker=juleol.MIN_BUTIKKER), "x")

    def test_tomt_svar_stopper(self):
        with self.assertRaisesRegex(juleol.HenteFeil, "juleøl"):
            juleol.bygg_data([], "x")

    def test_mjod_er_med_og_sider_holdes_utenfor(self):
        svar = svar_med() + [ol(900, ["By 1, Butikk 1"], kategori="Mjød", stil="Mead - Melomel"),
                             ol(901, ["By 1, Butikk 1"], kategori="Sider")]
        grupper = {o["id"]: o["gruppe"] for o in juleol.bygg_data(svar, "x")["ol"]}
        self.assertEqual(grupper.get("900"), "Mjød")
        self.assertNotIn("901", grupper)

    def test_lageret_peker_pa_riktig_butikk(self):
        svar = svar_med()
        svar[0]["all_stock"] = [{"store_name": "By 7, Butikk 7", "quantity": 12},
                                {"store_name": "By 8, Butikk 8", "quantity": 0}]
        data = juleol.bygg_data(svar, "x")
        lager = data["ol"][0]["lager"]
        self.assertEqual({data["butikker"][int(k)]: v for k, v in lager.items()}, {"By 7, Butikk 7": 12})

    def test_posisjon_i_samme_rekkefolge_som_butikkene(self):
        svar = svar_med()
        svar[0]["all_stock"] = [{"store_name": "By 3, Butikk 3", "quantity": 4, "gps_lat": 63.4295741, "gps_long": 10.3935812}]
        for o in svar[1:]:
            for s in o["all_stock"]:
                if s["store_name"] == "By 3, Butikk 3":
                    s["quantity"] = 0
        data = juleol.bygg_data(svar, "x")
        self.assertEqual(len(data["posisjon"]), len(data["butikker"]))
        i = data["butikker"].index("By 3, Butikk 3")
        self.assertEqual(data["posisjon"][i], [63.42957, 10.39358])
        self.assertIsNone(data["posisjon"][data["butikker"].index("By 4, Butikk 4")])

    def test_bare_kjente_lenker_slipper_gjennom(self):
        svar = svar_med()
        svar[0]["vmp_url"] = "javascript:alert(1)"
        svar[0]["untpd_url"] = "https://untappd.com/b/noe/1"
        svar[1]["untpd_url"] = "https://annen.example/b/1"
        data = juleol.bygg_data(svar, "x")["ol"]
        self.assertEqual(data[0]["polet"], "")
        self.assertEqual(data[0]["untappd"], "https://untappd.com/b/noe/1")
        self.assertEqual(data[1]["untappd"], "")
        self.assertEqual(data[1]["polet"], "https://www.vinmonopolet.no/p/1")

    def test_grupper(self):
        self.assertEqual(juleol.gruppe({"style": "Lager - Winter"}), "Klassisk juleøl")
        self.assertEqual(juleol.gruppe({"style": "Winter Ale"}), "Juleale og krydret")
        self.assertEqual(juleol.gruppe({"main_category": "Alkoholfritt", "style": "Stout"}), "Alkoholfritt")
        self.assertEqual(juleol.gruppe({"style": "Other", "sub_category": "Mørk lager"}), "Klassisk juleøl")
        self.assertEqual(juleol.gruppe({"style": None}), "Annet")


if __name__ == "__main__":
    unittest.main()
