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
BOARD     = os.path.join(HERE, "data", "board-members.json")
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

    cards = []
    for m in members:
        cat = m["cat"]
        title = (m.get("title") or "").strip()
        title_html = ('<span class="gm-title">%s</span> ' % esc(title)) if title else ""
        html = (card.rstrip("\n")
                .replace("{{INITIAL}}", esc(initial_of(m["name"])))
                .replace("{{TITLE_HTML}}", title_html)
                .replace("{{NAME}}", esc(m["name"]))
                .replace("{{CAT_LABEL}}", esc(cats[cat]["label"]))
                .replace("{{CAT}}", esc(cat)))
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

def render_board():
    """يبني قسم «مجلس الإدارة» من ملف البيانات + قالبَي القسم والبطاقة."""
    section_tpl = os.path.join(TEMPLATES, "board-section.html")
    card_tpl    = os.path.join(TEMPLATES, "board-card.html")
    if not (os.path.exists(section_tpl) and os.path.exists(card_tpl) and os.path.exists(BOARD)):
        return b""

    with io.open(BOARD, encoding="utf-8") as f:
        data = json.load(f)
    with io.open(card_tpl, encoding="utf-8") as f:
        card = f.read().rstrip("\n")
    with io.open(section_tpl, encoding="utf-8") as f:
        section = f.read()

    # أيقونة رمزية احترافية تُستخدم مؤقتًا مكان الصورة
    SYMBOL = ('<div class="bd-sym" aria-hidden="true"><span class="fr"></span>'
              '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.1" '
              'stroke-linecap="round" stroke-linejoin="round">'
              '<circle cx="32" cy="21" r="11"/>'
              '<path d="M11 57c0-11.6 9.4-19 21-19s21 7.4 21 19"/>'
              '</svg></div>')

    def media_for(m):
        photo = (m.get("photo") or "").strip()
        if photo:
            return '<img src="img/board/%s" alt="%s" loading="lazy" decoding="async" />' % (
                esc(photo), esc((m.get("title", "") + " " + m["name"]).strip()))
        return SYMBOL

    def render_card(m):
        title = (m.get("title") or "").strip()
        title_html = ('<span class="bd-t">%s</span> ' % esc(title)) if title else ""
        return (card
                .replace("{{RANK}}", esc(m.get("rank", "member")))
                .replace("{{MEDIA}}", media_for(m))
                .replace("{{TITLE_HTML}}", title_html)
                .replace("{{NAME}}", esc(m["name"]))
                .replace("{{ROLE}}", esc(m.get("role", ""))))

    members = data["members"]
    lead = [m for m in members if m.get("rank") in ("chair", "vice")]
    rest = [m for m in members if m.get("rank") not in ("chair", "vice")]
    t = data.get("term", {})

    section = (section
               .replace("{{LEAD_CARDS}}", "".join(render_card(m) for m in lead))
               .replace("{{MEMBER_CARDS}}", "".join(render_card(m) for m in rest))
               .replace("{{TERM_LABEL}}", esc(t.get("label", "")))
               .replace("{{TERM_NOTE}}",  esc(t.get("note", "")))
               .replace("{{START_H}}", esc(t.get("start_h", "")))
               .replace("{{START_G}}", esc(t.get("start_g", "")))
               .replace("{{END_H}}",   esc(t.get("end_h", "")))
               .replace("{{END_G}}",   esc(t.get("end_g", ""))))
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
    board_html = render_board()

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
        main = main.replace(b"{{BOARD_MEMBERS}}", board_html)
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
