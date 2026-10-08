#!/usr/bin/env python3
"""PoC de vigilancia competitiva: deteccion de keywords por coincidencia textual.

No llama a ninguna API. Recibe publicaciones ya obtenidas (JSON) y decide,
por cada una, si contiene alguna keyword configurada para su cuenta.

Uso:
  python3 detect.py --config config.json --posts posts.json --state estado.json

posts.json: lista de objetos
  {"account": "lidlespana", "network": "instagram", "post_id": "...",
   "published_at": "20261005081604", "text": "...", "url": "..."}

Regla de coincidencia (fase 1, sin IA): sin distinguir mayusculas ni tildes,
la keyword debe empezar en limite de palabra ("receta" detecta "receta" y
"recetas", pero no "preceta").
"""
import argparse, json, re, sys, unicodedata
from datetime import datetime, timezone
from pathlib import Path


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def find_keywords(text, keywords):
    t = norm(text)
    return [k for k in keywords if re.search(r"(?<!\w)" + re.escape(norm(k)), t)]


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--posts", required=True)
    ap.add_argument("--state", required=True, help="ids ya vistos (evita alertas repetidas)")
    a = ap.parse_args()

    accounts = {c["account"].lower(): c for c in json.loads(Path(a.config).read_text())["accounts"]}
    posts = json.loads(Path(a.posts).read_text())
    state_path = Path(a.state)
    seen = json.loads(state_path.read_text()) if state_path.exists() else {}

    t2 = now()  # momento en que nuestro sistema obtiene las publicaciones
    alerts = skipped = 0
    for p in posts:
        key = f'{p["network"]}:{p["post_id"]}'
        if key in seen:
            continue
        cfg = accounts.get(p["account"].lower())
        if cfg is None:
            print(f"[AVISO] cuenta sin configurar: {p['account']}", file=sys.stderr)
            continue
        hits = find_keywords(p["text"], cfg["keywords"])
        t3 = now()
        seen[key] = {"first_seen": t2, "published_at": p["published_at"], "keywords": hits}
        if not hits:
            skipped += 1
            print(f"SIN ALERTA  {cfg['competitor']} · {p['network']} · {p['published_at']} · {p['url']}")
            continue
        alerts += 1
        excerpt = " ".join(p["text"].split())[:160]
        print(
            "\n🚨 Nueva publicación relevante\n\n"
            f"Competidor: {cfg['competitor']}\n"
            f"Red: {p['network'].capitalize()}\n"
            f"Keyword detectada: {', '.join(hits)}\n\n"
            f"Fecha: {p['published_at']}\n"
            f"Texto:\n\"{excerpt}…\"\n\n"
            f"URL:\n{p['url']}\n"
            f"(obtenida T2={t2} · alerta T3={t3})\n"
        )
    state_path.write_text(json.dumps(seen, ensure_ascii=False, indent=1))
    print(f"\nResumen: {alerts} alerta(s), {skipped} sin alerta, {len(posts)} publicaciones leídas.")


if __name__ == "__main__":
    main()
