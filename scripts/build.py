"""Build index.html + data/public-data.json from a claude.ai database export.

Usage: python3 scripts/build.py <export_dir>
<export_dir> holds issues/*.json, authorityIssues/*.json and config/directory.json.
Resident names (raisedBy) and steps marked private are removed.
"""
import json, glob, os, sys, datetime

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
exp = sys.argv[1]

def collection(name):
    out = []
    for f in sorted(glob.glob(os.path.join(exp, name, "*.json"))):
        d = json.load(open(f))
        d.pop("raisedBy", None)
        d["steps"] = [s for s in d.get("steps", []) if not s.get("private")]
        out.append({**d, "id": os.path.basename(f)[:-5]})
    return sorted(out, key=lambda x: x["id"])

dpath = os.path.join(exp, "config", "directory.json")
dirdoc = json.load(open(dpath)) if os.path.exists(dpath) else {}
snap = {
    "dir": {k: dirdoc.get(k, "" if k == "society" else []) for k in ["society", "bearers", "portfolios", "authorities", "committee"]},
    "rwa": collection("issues"),
    "auth": collection("authorityIssues"),
    "publishedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
}
os.makedirs(os.path.join(root, "data"), exist_ok=True)
json.dump(snap, open(os.path.join(root, "data", "public-data.json"), "w"), indent=2, ensure_ascii=False)

src = open(os.path.join(root, "source.html")).read()
marker = '<script type="application/json" id="public-data">{}</script>'
assert marker in src, "public-data block not found in source.html"
blob = json.dumps(snap, ensure_ascii=False).replace("<", "\\u003c")
page = src.replace(marker, '<script type="application/json" id="public-data">' + blob + "</script>", 1)
head = ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<link rel="icon" href="logo.png"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);'
        'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
        '</head><body>\n')
open(os.path.join(root, "index.html"), "w").write(head + page + "\n</body></html>\n")
print(f"{len(snap['rwa'])} RWA issues, {len(snap['auth'])} authority issues")
