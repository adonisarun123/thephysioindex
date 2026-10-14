"""Scrape DrData physiotherapist listings into JSON/CSV (private import staging).
Polite: 1.5 s between requests, single connection. Output: data/imports/drdata/ (gitignored)."""
import csv, html, json, re, subprocess, sys, time
from urllib.parse import urljoin
from pathlib import Path

BASE = "https://www.drdata.in/"
LIST = BASE + "physiotherapists.php?search=Physiotherapist&page={}"
OUT = Path(__file__).resolve().parents[2] / "data" / "imports" / "drdata"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36"
DELAY = 1.5

def get(url):
    # curl uses the macOS system trust store (python.org builds lack one)
    for attempt in range(3):
        r = subprocess.run(["curl", "-sSL", "--max-time", "30", "-A", UA, url],
                           capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout.decode("utf-8", "replace")
        print(f"retry {attempt+1} {url}: {r.stderr.decode()[:200]}", file=sys.stderr)
        time.sleep(5)
    return None

def text(fragment):
    t = re.sub(r"<[^>]+>", " ", fragment)
    t = html.unescape(t).replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()

def rows(page_html):
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S | re.I):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S | re.I)
        yield tr, tds

def list_page(n):
    h = get(LIST.format(n))
    out = []
    if not h:
        return None
    for tr, tds in rows(h):
        if len(tds) < 5:
            continue
        m = re.search(r'href="([^"]+)"', tds[4])
        if not m:
            continue
        url = urljoin(BASE, m.group(1).replace("../", ""))
        out.append({"list_name": text(tds[0]), "list_degree": text(tds[1]),
                    "list_state": text(tds[2]), "list_city": text(tds[3]),
                    "source_url": url})
    return out

def slug(k):
    return re.sub(r"[^a-z0-9]+", "_", k.lower()).strip("_")

def profile(url):
    h = get(url)
    if not h:
        return {"fetch_error": True}
    rec = {}
    for tr, tds in rows(h):
        if len(tds) == 2:
            k, v = slug(text(tds[0])), text(tds[1])
            if k and k not in rec:
                rec[k] = v
    m = re.search(r'property="og:image"\s+content="([^"]+)"', h) or \
        re.search(r'<meta[^>]+og:image[^>]+content="([^"]+)"', h)
    img = m.group(1) if m else ""
    rec.pop("date_of_birth", None)  # personal data with no profile use; never stored
    rec["photo_url"] = "" if "no_doctor_image" in img else img
    rec["verified_on_source"] = "Switch to verified profile" not in h
    for k, v in list(rec.items()):
        if isinstance(v, str) and v in ("0000-00-00", "-", "---", "----"):
            rec[k] = ""
    return rec

def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    OUT.mkdir(parents=True, exist_ok=True)
    seen, items, empty_streak = set(), [], 0
    for n in range(1, 41):
        page = None
        for attempt in range(3):  # empty responses happen transiently
            page = list_page(n)
            time.sleep(DELAY)
            if page:
                break
            time.sleep(10)
        new = [r for r in (page or []) if r["source_url"] not in seen]
        print(f"list page {n}: {len(page or [])} rows, {len(new)} new", flush=True)
        if not new:
            empty_streak += 1
            if empty_streak >= 2:
                break
            continue
        empty_streak = 0
        for r in new:
            seen.add(r["source_url"]); items.append(r)
        if limit and len(items) >= limit:
            break
    if limit:
        items = items[:limit]
    scraped_at = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    for i, r in enumerate(items, 1):
        r.update(profile(r["source_url"]))
        r["scraped_at"] = scraped_at
        print(f"profile {i}/{len(items)} {r['list_name']}", flush=True)
        time.sleep(DELAY)
    (OUT / "physiotherapists.json").write_text(json.dumps(items, indent=1, ensure_ascii=False))
    keys = sorted({k for r in items for k in r})
    with open(OUT / "physiotherapists.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(items)
    print(f"DONE {len(items)} records -> {OUT}", flush=True)

if __name__ == "__main__":
    main()
