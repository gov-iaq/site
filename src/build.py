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
MEMBERS   = os.path.join(HERE, "data", "assembly-members.json")
DEFAULT_OUT = os.path.abspath(os.path.join(HERE, "..", "site"))

def rb(path):
    with open(path, "rb") as f:
        return f.read()

def esc(s):
    """تهريب النص لإدراجه بأمان في HTML."""
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))

def initial_of(name):
    """الحرف الأول من الاسم للأفاتار (يتجاهل 'ال' التعريف إن بدأ بها)."""
    w = name.strip().split()[0] if name.strip() else ""
    if len(w) > 2 and w.startswith("ال"):
        w = w[2:]
    return w[:1]

def render_members():
    """يبني قسم «أعضاء الجمعية العمومية» من ملف البيانات + قالبَي القسم والبطاقة."""
    section_tpl = os.path.join(TEMPLATES, "members-section.html")
    card_tpl    = os.path.join(TEMPLATES, "members-card.html")
    if not (os.path.exists(section_tpl) and os.path.exists(card_tpl) and os.path.exists(MEMBERS)):
        return b""

    with io.open(MEMBERS, encoding="utf-8") as f:
        data = json.load(f)
    members = data["members"]
    cats = data["categories"]

    with io.open(card_tpl, encoding="utf-8") as f:
        card = f.read()
    with io.open(section_tpl, encoding="utf-8") as f:
        section = f.read()

    # أيقونة لكل فئة عضوية
    ICONS = {
        "founder": ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
                    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                    '<path d="M12 3l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.5 9.1l5.9-.8Z"/></svg>'),
        "working": ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
                    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                    '<path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20"/>'
                    '<circle cx="9.5" cy="7.5" r="3.5"/><path d="M16.5 11.5l1.8 1.8 3.2-3.6"/></svg>'),
    }

    cards = []
    for i, m in enumerate(members, 1):
        cat = m["cat"]
        title = (m.get("title") or "").strip()
        title_html = ('<span class="mt">%s</span> ' % esc(title)) if title else ""
        html = (card.rstrip("\n")
                .replace("{{INITIAL}}", esc(initial_of(m["name"])))
                .replace("{{TITLE_HTML}}", title_html)
                .replace("{{NAME}}", esc(m["name"]))
                .replace("{{CAT_ICON}}", ICONS.get(cat, ""))
                .replace("{{CAT_LABEL}}", esc(cats[cat]["label"]))
                .replace("{{CAT}}", esc(cat))
                .replace("{{DELAY}}", str(min(i, 12) * 45)))
        cards.append(html)

    n_founder = sum(1 for m in members if m["cat"] == "founder")
    n_working = sum(1 for m in members if m["cat"] == "working")
    section = (section
               .replace("{{CARDS}}", "".join(cards))
               .replace("{{N_ALL}}", str(len(members)))
               .replace("{{N_FOUNDER}}", str(n_founder))
               .replace("{{N_WORKING}}", str(n_working))
               .replace("{{LBL_FOUNDER}}", esc(cats["founder"]["plural"]))
               .replace("{{LBL_WORKING}}", esc(cats["working"]["plural"])))
    return section.encode("utf-8")

def build(out_dir):
    head_tpl = rb(os.path.join(TEMPLATES, "head.html"))
    header_tpl = rb(os.path.join(TEMPLATES, "header.html"))
    footer = rb(os.path.join(TEMPLATES, "footer.html"))
    with io.open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    nav_slots = data["nav_slots"]

    os.makedirs(out_dir, exist_ok=True)
    members_html = render_members()

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
        # حقن الأقسام المُولّدة من البيانات
        main = main.replace(b"{{ASSEMBLY_MEMBERS}}", members_html)
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
