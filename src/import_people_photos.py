# -*- coding: utf-8 -*-
"""
استيراد صور الأشخاص (مجلس الإدارة / فريق العمل)
================================================
يقرأ الصور المرقّمة من  _incoming/board  أو  _incoming/team  ويربطها بالأعضاء
بنفس ترتيبهم في ملف البيانات، ثم يقتصّها مربّعة من المنتصف ويصغّرها للويب.

الاستخدام:
    python src/import_people_photos.py board
    python src/import_people_photos.py team
    python src/import_people_photos.py            (يستورد الاثنين إن وُجدا)
"""
import os, io, re, json, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
EXT = (".png", ".jpg", ".jpeg", ".webp")

TARGETS = {
    "board": {"data": "board-members.json", "out": "board", "size": 900},
    "team":  {"data": "team-members.json",  "out": "team",  "size": 900},
}

def run(kind):
    cfg = TARGETS[kind]
    inbox = os.path.join(ROOT, "_incoming", kind)
    data_p = os.path.join(HERE, "data", cfg["data"])
    outdir = os.path.join(HERE, "static", "img", cfg["out"])

    if not os.path.isdir(inbox):
        print("[%s] لا يوجد مجلد: %s" % (kind, inbox)); return 0
    try:
        from PIL import Image
    except ImportError:
        print("يلزم تثبيت pillow:  python -m pip install pillow"); return 1

    found = {}
    for f in os.listdir(inbox):
        if not f.lower().endswith(EXT):
            continue
        m = re.match(r"^(\d{1,2})\b", os.path.splitext(f)[0].strip())
        if m:
            found[int(m.group(1))] = os.path.join(inbox, f)
    if not found:
        print("[%s] لا صور مرقّمة في %s" % (kind, inbox)); return 0

    with io.open(data_p, encoding="utf-8") as fh:
        data = json.load(fh)
    members = data["members"]
    os.makedirs(outdir, exist_ok=True)

    done, skipped = [], []
    for i, m in enumerate(members, 1):
        src = found.get(i)
        if not src:
            skipped.append((i, m["name"])); continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            # اقتصاص مربّع من المنتصف مع ميل بسيط للأعلى (الوجه عادةً أعلى)
            w, h = im.size
            side = min(w, h)
            left = (w - side) // 2
            top = max(0, int((h - side) * 0.28))
            im = im.crop((left, top, left + side, top + side))
            s = cfg["size"]
            if im.width > s:
                im = im.resize((s, s), Image.LANCZOS)
            name = "%s-%02d.jpg" % (kind, i)
            out = os.path.join(outdir, name)
            im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
        m["photo"] = name
        done.append((i, name, "%dx%d" % (im.width, im.height),
                     os.path.getsize(out) // 1024, m["name"]))

    io.open(data_p, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=1))
    print("[%s] استُوردت %d صورة:" % (kind, len(done)))
    for i, name, dim, kb, nm in done:
        print("   %d. %-16s %-10s %4dKB  %s" % (i, name, dim, kb, nm))
    if skipped:
        print("   بلا صورة (%d): %s" % (len(skipped), "، ".join(n for _, n in skipped)))
    return 0

if __name__ == "__main__":
    kinds = sys.argv[1:] or list(TARGETS)
    bad = [k for k in kinds if k not in TARGETS]
    if bad:
        print("نوع غير معروف:", bad, "— المتاح:", list(TARGETS)); raise SystemExit(1)
    rc = 0
    for k in kinds:
        rc |= run(k)
    print("\nالخطوة التالية:  python src/build.py")
    raise SystemExit(rc)
