# -*- coding: utf-8 -*-
"""
مولّد موقع «جمعية حاضنة الجمعيات»
=================================
يبني صفحات الموقع الثابتة من مصدر واحد:
  - templates/  : القالب المشترك (head / header / footer)
  - content/    : محتوى كل صفحة (banner + main)
  - data/pages.json : بيانات كل صفحة (العنوان/الوصف/الرابط/عناصر القائمة النشطة)
  - static/     : الصفحات الخاصة (admin/404...) والأصول (صور، robots، sitemap، files/)

الاستخدام:
    python build.py            # يبني إلى ../site
    python build.py --out DIR  # يبني إلى مجلد آخر (مفيد للتحقّق)

كل شيء يُعالَج على مستوى البايت للحفاظ على التطابق التام.
"""
import os, io, json, argparse, shutil

HERE      = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(HERE, "templates")
CONTENT   = os.path.join(HERE, "content")
STATIC    = os.path.join(HERE, "static")
DATA      = os.path.join(HERE, "data", "pages.json")
DEFAULT_OUT = os.path.abspath(os.path.join(HERE, "..", "site"))

def rb(path):
    with open(path, "rb") as f:
        return f.read()

def build(out_dir):
    head_tpl = rb(os.path.join(TEMPLATES, "head.html"))
    header_tpl = rb(os.path.join(TEMPLATES, "header.html"))
    footer = rb(os.path.join(TEMPLATES, "footer.html"))
    with io.open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    nav_slots = data["nav_slots"]

    os.makedirs(out_dir, exist_ok=True)

    # 1) الصفحات المُولّدة من القالب
    for pg in data["pages"]:
        slug = pg["slug"]
        head = (head_tpl
                .replace(b"{{TITLE}}", pg["title"].encode("utf-8"))
                .replace(b"{{DESC}}",  pg["desc"].encode("utf-8"))
                .replace(b"{{URL}}",   pg["url"].encode("utf-8")))
        body_tag = ('<body class="hybrid" data-page="%s">' % slug).encode("utf-8")
        header = header_tpl
        active = set(pg.get("active", []))
        for i in range(nav_slots):
            header = header.replace(b"{{ACT%d}}" % i, b" active" if i in active else b"")
        banner = rb(os.path.join(CONTENT, slug + ".banner.html"))
        main   = rb(os.path.join(CONTENT, slug + ".main.html"))
        page = head + body_tag + header + banner + main + footer
        with open(os.path.join(out_dir, slug + ".html"), "wb") as f:
            f.write(page)

    # 2) الصفحات الخاصة والأصول (تُنسخ كما هي)
    for root, dirs, files in os.walk(STATIC):
        rel = os.path.relpath(root, STATIC)
        dst_root = out_dir if rel == "." else os.path.join(out_dir, rel)
        os.makedirs(dst_root, exist_ok=True)
        for name in files:
            shutil.copy2(os.path.join(root, name), os.path.join(dst_root, name))

    count = len(data["pages"])
    print("بُنيت %d صفحة من القالب + الأصول الثابتة إلى: %s" % (count, out_dir))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT, help="مجلد الإخراج")
    args = ap.parse_args()
    build(args.out)
