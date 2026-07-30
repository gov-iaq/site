# -*- coding: utf-8 -*-
"""
استيراد صور الأخبار
====================
يقرأ الصور المرقّمة 1..9 من  _incoming/news/  ويربطها بالأخبار بترتيب التاريخ
(الأقدم = 1)، ثم يصغّرها للويب وينسخها إلى  src/static/img/news/  ويحدّث news.json.

الاستخدام:
    python src/import_news_images.py
    python src/import_news_images.py --width 1100     (عرض أقصى مختلف)
"""
import os, io, re, json, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
INBOX = os.path.join(ROOT, "_incoming", "news")
OUTDIR = os.path.join(HERE, "static", "img", "news")
NEWS_J = os.path.join(HERE, "data", "news.json")

EXT = (".png", ".jpg", ".jpeg", ".webp")

def slug_for(item, idx):
    """اسم ملف لاتيني مشتق من وسم الخبر وتاريخه."""
    d = item.get("date", "")
    base = "news-%s-%02d" % (d.replace("-", ""), idx)
    return base

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=1200, help="أقصى عرض للصورة")
    args = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        print("يلزم تثبيت pillow:  python -m pip install pillow")
        return 1

    if not os.path.isdir(INBOX):
        print("لا يوجد مجلد الاستقبال:", INBOX)
        return 1

    # اجمع الملفات المرقّمة
    found = {}
    for f in os.listdir(INBOX):
        if not f.lower().endswith(EXT):
            continue
        m = re.match(r"^(\d{1,2})\b", os.path.splitext(f)[0].strip())
        if m:
            found[int(m.group(1))] = os.path.join(INBOX, f)

    if not found:
        print("لم أجد صورًا مرقّمة (1..9) في:", INBOX)
        print("راجع ملف اقرأني.txt داخل المجلد.")
        return 1

    with io.open(NEWS_J, encoding="utf-8") as fh:
        data = json.load(fh)
    # الأخبار في الملف مرتّبة من الأقدم إلى الأحدث
    items = sorted(data["news"], key=lambda x: x.get("date", ""))

    os.makedirs(OUTDIR, exist_ok=True)
    done, missing = [], []
    for i, item in enumerate(items, 1):
        src = found.get(i)
        if not src:
            missing.append((i, item["title"][:50]))
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            if im.width > args.width:
                h = round(im.height * args.width / im.width)
                im = im.resize((args.width, h), Image.LANCZOS)
            name = slug_for(item, i) + ".jpg"
            out = os.path.join(OUTDIR, name)
            im.save(out, "JPEG", quality=86, optimize=True, progressive=True)
        item["image"] = name
        done.append((i, name, "%dx%d" % (im.width, im.height),
                     os.path.getsize(out) // 1024, item["title"][:46]))

    io.open(NEWS_J, "w", encoding="utf-8").write(
        json.dumps(data, ensure_ascii=False, indent=1))

    print("استُوردت %d صورة:" % len(done))
    for i, name, dim, kb, title in done:
        print("  %d. %-28s %-11s %4dKB  %s" % (i, name, dim, kb, title))
    if missing:
        print("\nناقصة (%d):" % len(missing))
        for i, t in missing:
            print("  %d. %s" % (i, t))
    print("\nالخطوة التالية:  python src/build.py")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
