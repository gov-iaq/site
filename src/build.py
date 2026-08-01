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
import os, io, re, json, argparse, shutil

HERE      = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(HERE, "templates")
CONTENT   = os.path.join(HERE, "content")
STATIC    = os.path.join(HERE, "static")
DATA      = os.path.join(HERE, "data", "pages.json")
MEMBERS   = os.path.join(HERE, "data", "assembly-members.json")
BOARD     = os.path.join(HERE, "data", "board-members.json")
TEAM      = os.path.join(HERE, "data", "team-members.json")
DISCLOSURE= os.path.join(HERE, "data", "disclosure.json")
ABOUT     = os.path.join(HERE, "data", "about.json")
CONTACT_F = os.path.join(HERE, "data", "contact.json")
FILES_J   = os.path.join(HERE, "data", "files.json")
PARTNERS_J= os.path.join(HERE, "data", "partners.json")
NEWS_J    = os.path.join(HERE, "data", "news.json")
LEGAL_J   = os.path.join(HERE, "data", "legal.json")
SUPA_J    = os.path.join(HERE, "data", "supabase.json")
DEFAULT_OUT = os.path.abspath(os.path.join(HERE, "..", "site"))

NLB = b"\n"
NLS = "\n"

# زخرفة مستهلّ القسم (خطّان ذهبيّان ونجمة رباعية) — تُحقن في كل قسم عبر {{ORN}}
ORN_HTML = '<div class="divider reveal" aria-hidden="true"><span class="line r"></span><span class="glyph"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="16" cy="16" r="3.4"/><path d="M16 3.5C19.5 9 19.5 23 16 28.5 12.5 23 12.5 9 16 3.5Z"/><path d="M3.5 16C9 12.5 23 12.5 28.5 16 23 19.5 9 19.5 3.5 16Z"/></svg></span><span class="line"></span></div>'

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

def render_team():
    """يبني قسم «فريق العمل التنفيذي» من ملف البيانات."""
    section_tpl = os.path.join(TEMPLATES, "team-section.html")
    card_tpl    = os.path.join(TEMPLATES, "team-card.html")
    if not (os.path.exists(section_tpl) and os.path.exists(card_tpl) and os.path.exists(TEAM)):
        return b""

    with io.open(TEAM, encoding="utf-8") as f:
        data = json.load(f)
    with io.open(card_tpl, encoding="utf-8") as f:
        card = f.read().rstrip("\n")
    with io.open(section_tpl, encoding="utf-8") as f:
        section = f.read()

    SYMBOL = ('<div class="tm-sym" aria-hidden="true"><span class="fr"></span>'
              '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.1" '
              'stroke-linecap="round" stroke-linejoin="round">'
              '<circle cx="32" cy="21" r="11"/>'
              '<path d="M11 57c0-11.6 9.4-19 21-19s21 7.4 21 19"/></svg></div>')
    IC_PHONE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
                'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                '<path d="M6.2 3.5h3l1.5 3.8-2 1.4a11.6 11.6 0 0 0 5.6 5.6l1.4-2 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8'
                'A15.6 15.6 0 0 1 4.4 5.5a1.8 1.8 0 0 1 1.8-2Z"/></svg>')
    IC_MAIL = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
               'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
               '<rect x="2.8" y="5" width="18.4" height="14" rx="2.4"/><path d="M3.4 6.6 12 12.8l8.6-6.2"/></svg>')

    cards = []
    for m in data["members"]:
        title = (m.get("title") or "").strip()
        title_html = ('<span class="tm-t">%s</span> ' % esc(title)) if title else ""
        photo = (m.get("photo") or "").strip()
        if photo:
            media = ('<img src="img/team/%s" alt="%s" loading="lazy" decoding="async" />'
                     % (esc(photo), esc((title + " " + m["name"]).strip())))
        else:
            media = SYMBOL

        rows = []
        phone = (m.get("phone") or "").strip()
        if phone:
            digits = "".join(ch for ch in phone if ch.isdigit())
            rows.append('<a href="tel:%s">%s<bdi>%s</bdi></a>' % (esc(digits), IC_PHONE, esc(phone)))
        email = (m.get("email") or "").strip()
        if email:
            rows.append('<a href="mailto:%s">%s%s</a>' % (esc(email), IC_MAIL, esc(email)))
        contact = ('<div class="tm-contact">%s</div>' % "".join(rows)) if rows else ""

        cards.append(card
                     .replace("{{RANK}}", esc(m.get("rank", "member")))
                     .replace("{{MEDIA}}", media)
                     .replace("{{TITLE_HTML}}", title_html)
                     .replace("{{NAME}}", esc(m["name"]))
                     .replace("{{ROLE}}", esc(m.get("role", "")))
                     .replace("{{CONTACT}}", contact))

    return section.replace("{{TEAM_CARDS}}", "".join(cards)).encode("utf-8")

def _disclosure_data():
    if not os.path.exists(DISCLOSURE):
        return None
    with io.open(DISCLOSURE, encoding="utf-8") as f:
        return json.load(f)

def render_disclosure():
    """يبني كتلة «إقرار الإفصاح»."""
    tpl = os.path.join(TEMPLATES, "disclosure-block.html")
    data = _disclosure_data()
    if not (os.path.exists(tpl) and data):
        return b""
    d = data["declaration"]
    with io.open(tpl, encoding="utf-8") as f:
        block = f.read()
    items = "".join('<li><span class="dn">%d</span><span>%s</span></li>' % (i, esc(x))
                    for i, x in enumerate(d["items"], 1))
    intro = esc(d["intro"]).replace("(%s)" % data["registry_no"],
                                   "(<b>%s</b>)" % data["registry_no"])
    return (block
            .replace("{{EYEBROW}}", esc(d.get("eyebrow", "")))
            .replace("{{TITLE}}", esc(d.get("title", "")))
            .replace("{{INTRO}}", intro)
            .replace("{{ITEMS}}", items)
            .replace("{{CLOSING}}", esc(d.get("closing", "")))).encode("utf-8")

def render_notice(key):
    """يبني قسم «لا يوجد حاليًا» لصفحة معيّنة (اللجان / الأوقاف)."""
    tpl = os.path.join(TEMPLATES, "notice-section.html")
    data = _disclosure_data()
    if not (os.path.exists(tpl) and data):
        return b""
    n = data.get("notices", {}).get(key)
    if not n:
        return b""
    with io.open(tpl, encoding="utf-8") as f:
        section = f.read()
    paras = "".join("<p>%s</p>" % esc(p) for p in n.get("paragraphs", []))
    return (section
            .replace("{{EYEBROW}}", esc(n.get("eyebrow", "")))
            .replace("{{TITLE}}", esc(n.get("title", "")))
            .replace("{{PARAGRAPHS}}", paras)).encode("utf-8")

def render_about():
    """يبني تبويبات صفحة «عن الجمعية» من ملف البيانات."""
    tpl = os.path.join(TEMPLATES, "about-tabs.html")
    if not (os.path.exists(tpl) and os.path.exists(ABOUT)):
        return b""
    with io.open(ABOUT, encoding="utf-8") as f:
        d = json.load(f)
    with io.open(tpl, encoding="utf-8") as f:
        s = f.read()

    pillars = "".join('<span><i aria-hidden="true"></i>%s</span>' % esc(p)
                      for p in d.get("vision_pillars", []))
    def li(items):
        return "".join('<li><span class="n">%d</span><span>%s</span></li>' % (i, esc(x))
                       for i, x in enumerate(items, 1))

    org = d.get("org", {})
    chain_html = []
    chain = org.get("chain", [])
    for i, node in enumerate(chain, 1):
        chain_html.append('<div class="ab-node lvl%d">%s</div>' % (i, esc(node)))
        if i < len(chain):
            chain_html.append('<div class="ab-drop" aria-hidden="true"></div>')
    sup = org.get("support", {})
    sup_label = sup.get("label", "")
    depts = "".join(
        '<div class="ab-col"><div class="ab-unit%s">%s</div></div>'
        % (" is-support" if x == sup_label else "", esc(x))
        for x in org.get("departments", []))
    sup_units = "".join('<div class="ab-scol"><span>%s</span></div>' % esc(x)
                        for x in sup.get("units", []))

    return (s
            .replace("{{VISION}}", esc(d.get("vision", "")))
            .replace("{{PILLARS}}", pillars)
            .replace("{{MISSION}}", esc(d.get("mission", "")))
            .replace("{{STRATEGIC}}", li(d.get("strategic", [])))
            .replace("{{OPERATIONAL}}", li(d.get("operational", [])))
            .replace("{{N_STRATEGIC}}", str(len(d.get("strategic", []))))
            .replace("{{N_OPERATIONAL}}", str(len(d.get("operational", []))))
            .replace("{{CHAIN}}", "".join(chain_html))
            .replace("{{DEPARTMENTS}}", depts)
            .replace("{{SUPPORT_LABEL}}", esc(sup.get("label", "")))
            .replace("{{SUPPORT_UNITS}}", sup_units)).encode("utf-8")

def _file_rows(items):
    """يبني صفوف الملفات بنفس ترميز الموقع (متوافق مع البحث الفوري)."""
    IC = ('<div class="fic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'
          '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>'
          '<path d="M14 3v5h5"/><path d="M8.5 13.5h1a1 1 0 0 1 0 2h-1v-2Zm0 2v1.5"/>'
          '<path d="M12.5 13.5h1.2M12.5 13.5v3M12.5 15h1"/></svg></div>')
    CLK = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">'
           '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>')
    DL = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
          'stroke-linecap="round" stroke-linejoin="round">'
          '<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>')
    EYE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
           'stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/>'
           '<circle cx="12" cy="12" r="3"/></svg>')
    rows = []
    for it in items:
        meta = []
        if it.get("date"):
            meta.append("<span>%s%s</span>" % (CLK, esc(it["date"])))
        size = "PDF · %s" % esc(it.get("size", ""))
        if it.get("pages"):
            size += " · %d صفحة" % it["pages"]
        meta.append("<span>%s</span>" % size)
        dl_attr = ' download="%s"' % esc(it["dl_name"]) if it.get("dl_name") else " download"
        rows.append(
            '<div class="file-row reveal" data-title="%s">%s'
            '<div class="fmain"><div class="ftitle">%s</div>'
            '<div class="fmeta">%s</div></div>'
            '<div class="factions">'
            '<a href="%s" class="file-view" target="_blank" rel="noopener" '
            'title="معاينة في المتصفّح">%s معاينة</a>'
            '<a href="%s" class="file-dl"%s>%s تحميل</a>'
            '</div></div>'
            % (esc(it["title"]), IC, esc(it["title"]), "".join(meta),
               esc(it["file"]), EYE, esc(it["file"]), dl_attr, DL))
    return "".join(rows)

def render_licenses_gallery():
    """معرض التراخيص: صورة الشهادة في إطار + بياناتها + معاينة وتحميل."""
    tpl = os.path.join(TEMPLATES, "licenses-gallery.html")
    if not (os.path.exists(tpl) and os.path.exists(FILES_J)):
        return b""
    with io.open(FILES_J, encoding="utf-8") as f:
        items = json.load(f).get("categories", {}).get("licenses", [])
    with io.open(tpl, encoding="utf-8") as f:
        section = f.read()

    cards = []
    for i, it in enumerate(items, 1):
        facts = "".join('<div class="lc-fact"><dt>%s</dt><dd>%s</dd></div>'
                        % (esc(k), esc(v)) for k, v in it.get("facts", []))
        img = it.get("img", "")
        media = ('<img src="%s" alt="%s" loading="lazy" decoding="async" />' % (esc(img), esc(it["title"]))
                 if img else '<div class="lc-noimg" aria-hidden="true"></div>')
        dl_attr = ' download="%s"' % esc(it["dl_name"]) if it.get("dl_name") else " download"
        cards.append(
            '<article class="lc-card reveal" style="--lc-d:%dms">'
            '<button type="button" class="lc-media" data-zoom="%s" data-caption="%s" '
            'aria-label="تكبير %s">%s<span class="lc-zoom" aria-hidden="true">'
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6M11 8.4v5.2M8.4 11h5.2"/>'
            '</svg></span></button>'
            '<div class="lc-body"><h3 class="lc-title">%s</h3>'
            '<p class="lc-valid">%s</p><dl class="lc-facts">%s</dl>'
            '<div class="lc-actions">'
            '<a href="%s" class="lc-btn lc-btn-ghost" target="_blank" rel="noopener">معاينة الشهادة</a>'
            '<a href="%s" class="lc-btn lc-btn-solid"%s>تحميل PDF</a>'
            '</div></div></article>'
            % (i * 110, esc(img), esc(it["title"]), esc(it["title"]), media,
               esc(it["title"]), esc(it.get("date", "")), facts,
               esc(it["file"]), esc(it["file"]), dl_attr))

    return section.replace("{{LICENSE_CARDS}}", "".join(cards)).encode("utf-8")

def files_map():
    """خريطة استبدال قوائم ملفات الحوكمة من المانيفست."""
    if not os.path.exists(FILES_J):
        return {}
    with io.open(FILES_J, encoding="utf-8") as f:
        data = json.load(f)
    cats = data.get("categories", {})
    out = {}
    for key, marker in (("policies", b"{{FILES_POLICIES}}"), ("minutes", b"{{FILES_MINUTES}}"),
                        ("financials", b"{{FILES_FINANCIALS}}"), ("annual", b"{{FILES_ANNUAL}}"),
                        ("surveys", b"{{FILES_SURVEYS}}"), ("licenses", b"{{FILES_LICENSES}}")):
        out[marker] = _file_rows(cats.get(key, [])).encode("utf-8")
    return out

MQ_SETS = 4   # يجب أن يطابق --mq-sets في head.html

def render_partners():
    """شعارات الشركاء في مجموعات متطابقة تمامًا لتمرير متصل بلا قفزة ولا فراغ.

    الإزاحة في الأنيميشن = مجموعة واحدة بالضبط، فتكفي المجموعات الباقية
    (MQ_SETS-1) لتغطية أعرض شاشة: 3 × 1700px تقريبًا.
    """
    if not os.path.exists(PARTNERS_J):
        return b""
    with io.open(PARTNERS_J, encoding="utf-8") as f:
        items = json.load(f).get("partners", [])
    if not items:
        return b""

    def one(p, dup):
        logo = "img/partners/%s" % p["logo"]
        inner = ('<img src="%s" alt="%s" loading="lazy" decoding="async" />'
                 % (esc(logo), "" if dup else esc(p["name"])))
        url = (p.get("url") or "").strip()
        if url and not dup:
            return ('<a class="plogo" href="%s" target="_blank" rel="noopener" title="%s">%s</a>'
                    % (esc(url), esc(p["name"]), inner))
        attrs = ' aria-hidden="true"' if dup else ' title="%s"' % esc(p["name"])
        return '<div class="plogo"%s>%s</div>' % (attrs, inner)

    sets = []
    for i in range(MQ_SETS):
        dup = i > 0
        sets.append('<div class="mq-set"%s>%s</div>'
                    % (' aria-hidden="true"' if dup else '',
                       "".join(one(p, dup) for p in items)))

    return "".join(sets).encode("utf-8")

CAL_IC = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">'
          '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>')
X_IC = ('<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 3h3.3l-7.2 8.2L23.5 21h-6.6'
        'l-5.2-6.8L5.8 21H2.5l7.7-8.8L1.6 3h6.8l4.7 6.2L18.9 3Zm-1.2 16h1.8L7 4.9H5.1L17.7 19Z"/></svg>')

def _news_items():
    if not os.path.exists(NEWS_J):
        return []
    with io.open(NEWS_J, encoding="utf-8") as f:
        items = json.load(f).get("news", [])
    # الأحدث أولًا
    return sorted(items, key=lambda x: x.get("date", ""), reverse=True)

def render_news():
    """صفحة المركز الإعلامي: بطاقات كاملة + فلترة بالوسوم."""
    tpl = os.path.join(TEMPLATES, "news-section.html")
    items = _news_items()
    if not (os.path.exists(tpl) and items):
        return b""
    with io.open(tpl, encoding="utf-8") as f:
        section = f.read()

    SYM = ('<div class="nw-sym" aria-hidden="true"><span class="fr"></span>'
           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" '
           'stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M4 5.5h11a2 2 0 0 1 2 2V19H6a2 2 0 0 1-2-2V5.5Z"/>'
           '<path d="M17 9h1.6A1.4 1.4 0 0 1 20 10.4V17a2 2 0 0 1-2 2"/>'
           '<path d="M7.5 9h4M7.5 12h6M7.5 15h4"/></svg></div>')
    ARROW = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
             'stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>')

    ZOOM = ('<span class="nw-zoom" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" '
            'stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/>'
            '<path d="M20 20l-3.6-3.6M11 8.4v5.2M8.4 11h5.2"/></svg></span>')
    cards = []
    for i, n in enumerate(items):
        img = (n.get("image") or "").strip()
        media = ('<img src="img/news/%s" alt="%s" loading="lazy" decoding="async" />%s'
                 % (esc(img), esc(n["title"]), ZOOM)) if img else SYM
        body = "".join("<p>%s</p>" % esc(p) for p in n.get("body", []))
        facts = "".join('<div class="nw-fact"><dt>%s</dt><dd>%s</dd></div>' % (esc(k), esc(v))
                        for k, v in n.get("facts", []) or [])
        facts_html = '<dl class="nw-facts">%s</dl>' % facts if facts else ""
        cta = n.get("cta")
        cta_html = ('<div class="nw-actions"><a class="nw-btn" href="%s" target="_blank" '
                    'rel="noopener">%s %s</a></div>'
                    % (esc(cta["url"]), esc(cta["label"]), ARROW)) if cta else ""
        lead = '<p class="nw-lead">%s</p>' % esc(n["lead"]) if n.get("lead") else ""
        if img:
            media_attrs = (' class="nw-media is-photo" role="button" tabindex="0" '
                           'data-zoom="img/news/%s" data-caption="%s" aria-label="تكبير صورة الخبر"'
                           % (esc(img), esc(n["title"])))
        else:
            media_attrs = ' class="nw-media"'
        cards.append(
            '<article class="nw-card" data-tag="%s" style="--nw-d:%dms">'
            '<div%s><span class="nw-tag">%s</span>%s</div>'
            '<div class="nw-body">'
            '<div class="nw-date">%s<time datetime="%s">%s</time></div>'
            '<h3 class="nw-title">%s</h3>%s<div class="nw-text">%s</div>%s%s'
            '</div></article>'
            % (esc(n["tag"]), i * 70, media_attrs, esc(n["tag"]), media, CAL_IC, esc(n["date"]),
               esc(n["date_ar"]), esc(n["title"]), lead, body, facts_html, cta_html))

    tags = []
    seen = []
    for n in items:
        if n["tag"] not in seen:
            seen.append(n["tag"])
    filters = ['<button type="button" class="nw-fil" data-tag="all" aria-pressed="true">'
               'كل الأخبار <span class="c">%d</span></button>' % len(items)]
    for t in seen:
        c = sum(1 for n in items if n["tag"] == t)
        filters.append('<button type="button" class="nw-fil" data-tag="%s" aria-pressed="false">'
                       '%s <span class="c">%d</span></button>' % (esc(t), esc(t), c))

    return (section
            .replace("{{NEWS_CARDS}}", "".join(cards))
            .replace("{{NEWS_FILTERS}}", "".join(filters))).encode("utf-8")

def render_news_strip(limit=4):
    """شريط أحدث الأخبار في الصفحة الرئيسية (بنفس ترميز الموقع الحالي)."""
    items = _news_items()[:limit]
    if not items:
        return b""
    MORE = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>')
    out = []
    for n in items:
        img = (n.get("image") or "").strip()
        img_html = ('<div class="news-img"><img src="img/news/%s" alt="%s" loading="lazy" '
                    'decoding="async" /><span class="news-tag">%s</span></div>'
                    % (esc(img), esc(n["title"]), esc(n["tag"]))
                    if img else
                    '<div class="news-img"><span class="news-tag">%s</span></div>' % esc(n["tag"]))
        excerpt = n.get("lead") or (n.get("body") or [""])[0]
        out.append(
            '<article class="news-card">%s<div class="news-body">'
            '<div class="news-date">%s%s</div><h3>%s</h3><p>%s</p>'
            '<div class="news-foot"><span class="news-src">%sعبر منصة إكس</span>'
            '<a href="news.html" class="news-more">اقرأ المزيد%s</a></div>'
            '</div></article>'
            % (img_html, CAL_IC, esc(n["date_ar"]), esc(n["title"]), esc(excerpt), X_IC, MORE))
    return "".join(out).encode("utf-8")

def render_legal(key):
    """يبني صفحة نظامية (privacy / terms) من legal.json."""
    tpl = os.path.join(TEMPLATES, "legal-section.html")
    if not (os.path.exists(tpl) and os.path.exists(LEGAL_J)):
        return b""
    with io.open(LEGAL_J, encoding="utf-8") as f:
        data = json.load(f)
    d = data.get(key)
    if not d:
        return b""
    with io.open(tpl, encoding="utf-8") as f:
        s = f.read()

    TK = ('<span class="tk"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
          'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'
          '<path d="M20 6L9 17l-5-5"/></svg></span>')
    toc, secs = [], []
    for i, sec in enumerate(d.get("sections", []), 1):
        sid = "%s-s%d" % (key, i)
        toc.append('<li><a href="#%s">%s</a></li>' % (sid, esc(sec["h"])))
        lis = "".join("<li>%s<span>%s</span></li>" % (TK, esc(x)) for x in sec.get("items", []))
        secs.append('<section class="lg-sec" id="%s"><h3><span class="n">%d</span>%s</h3>'
                    '<ul>%s</ul></section>' % (sid, i, esc(sec["h"]), lis))

    return (s
            .replace("{{TOC}}", "".join(toc))
            .replace("{{SECTIONS}}", "".join(secs))
            .replace("{{EYEBROW}}", esc(d.get("eyebrow", "")))
            .replace("{{TITLE}}", esc(d.get("title", "")))
            .replace("{{INTRO}}", esc(d.get("intro", "")))
            .replace("{{UPDATED}}", esc(data.get("updated", "")))
            .replace("{{NOTE}}", esc(data.get("_تنبيه", "")))).encode("utf-8")

def supa_cfg():
    """إعداد Supabase العلني (الرابط + المفتاح القابل للنشر) — يُقرأ مرّة واحدة."""
    cfg = {"url": "", "key": ""}
    if os.path.exists(SUPA_J):
        with io.open(SUPA_J, encoding="utf-8") as f:
            d = json.load(f)
        cfg = {"url": (d.get("url") or "").rstrip("/"),
               "key": d.get("publishable_key") or d.get("anon_key_legacy") or ""}
    return cfg

def path_algo():
    """خوارزمية العنونة المشتركة كنصّ — تُحقن في الصفحات وفي اللوحة معًا."""
    p = os.path.join(TEMPLATES, "iaq-path.js")
    return rb(p) if os.path.exists(p) else b""

def runtime_script(slug):
    """سكربت التشغيل العلنيّ لصفحة واحدة: الإعداد + خوارزمية العنونة + الطبقة."""
    body = os.path.join(TEMPLATES, "iaq-runtime.js")
    if not os.path.exists(body):
        return b""
    cfg = json.dumps(supa_cfg(), ensure_ascii=False).encode("utf-8")
    head = (b"var IAQ_SUPA=" + cfg + b",IAQ_SLUG=" +
            json.dumps(slug, ensure_ascii=False).encode("utf-8") + b";\n")
    lists = os.path.join(TEMPLATES, "iaq-lists.js")
    extra = rb(lists) if os.path.exists(lists) else b""
    return (b"<script>\n" + head + path_algo() + b"\n" + rb(body)
            + b"\n" + extra + b"</script>\n")

STRIP_MODES = ("auto", "manual", "fade")

def strip_mode():
    """نمط حركة شريط الشركاء الافتراضي — يبدّله مدير النظام لاحقًا من اللوحة."""
    if os.path.exists(PARTNERS_J):
        with io.open(PARTNERS_J, encoding="utf-8") as f:
            m = (json.load(f).get("strip_mode") or "").strip()
        if m in STRIP_MODES:
            return m
    return "auto"

def admin_map():
    """إعداد Supabase العلني + رابط اللوحة، يُحقن في صفحات اللوحة فقط."""
    cfg = supa_cfg()
    login = "iaq-cp-9f4b21.html"
    if os.path.exists(CONTACT_F):
        with io.open(CONTACT_F, encoding="utf-8") as f:
            login = json.load(f).get("admin_login_url") or login
    panel = login.replace(".html", "-panel.html")
    return {
        b"{{SUPABASE_CFG}}": json.dumps(cfg, ensure_ascii=False).encode("utf-8"),
        b"{{PANEL_URL}}":    panel.encode("utf-8"),
        b"{{LOGIN_URL}}":    login.encode("utf-8"),
        b"{{PATH_ALGO}}":    path_algo(),
        b"{{RUNTIME_404}}":  runtime_script("404"),
    }

BAD_CHARS = '<>"'

def safe_field(name, val):
    """بيانات التواصل تُدرج نصًّا خامًا في HTML وفي JSON-LD معًا، فلا يوجد تهريب
    يصلح للسياقين. نمنع المحارف التي تكسر أيًّا منهما بدل تخريب البيانات."""
    s = "" if val is None else str(val)
    bad = [c for c in BAD_CHARS if c in s]
    if bad:
        raise SystemExit(
            "خطأ في contact.json — الحقل «%s» يحتوي محارف غير مسموحة: %s"
            % (name, " ".join(bad))
            + chr(10) + "  القيمة: %s" % s
            + chr(10) + "  المحارف الممنوعة: %s" % BAD_CHARS)
    if any(ord(c) < 32 and c != chr(9) for c in s):
        raise SystemExit("خطأ في contact.json — الحقل «%s» يحتوي محارف تحكّم." % name)
    return s.encode("utf-8")

def contact_map():
    """خريطة استبدال بيانات التواصل — تُطبَّق على القالب المشترك وكل الصفحات."""
    if not os.path.exists(CONTACT_F):
        return {}
    with io.open(CONTACT_F, encoding="utf-8") as f:
        c = json.load(f)
    s = c.get("socials", {})
    def soc(key):
        # الروابط الفارغة تعود إلى صفحة التواصل بدل رابط معطّل
        return s.get(key) or "contact.html"
    return {
        b"{{LICENSE}}":       safe_field("license_no", c.get("license_no", "")),
        b"{{CITY}}":          safe_field("city", c.get("city", "")),
        b"{{COUNTRY}}":       safe_field("country", c.get("country", "")),
        b"{{ADDR_SHORT}}":    safe_field("address_short", c.get("address_short", "")),
        b"{{ADDR_LINE}}":     safe_field("address_line", c.get("address_line", "")),
        b"{{PHONE_DISPLAY}}": safe_field("phone_display", c.get("phone_display", "")),
        b"{{PHONE_TEL}}":     safe_field("phone_tel", c.get("phone_tel", "")),
        b"{{EMAIL}}":         safe_field("email", c.get("email", "")),
        b"{{DONATE_URL}}":    safe_field("donate_url", c.get("donate_url") or "contact.html"),
        b"{{HOURS}}":         safe_field("hours", c.get("hours", "")),
        b"{{SOC_X}}":         safe_field("socials.x", soc("x")),
        b"{{SOC_YOUTUBE}}":   safe_field("socials.youtube", soc("youtube")),
        b"{{SOC_LINKEDIN}}":  safe_field("socials.linkedin", soc("linkedin")),
        b"{{SOC_WHATSAPP}}":  safe_field("socials.whatsapp", soc("whatsapp")),
        b"{{SOC_INSTAGRAM}}": safe_field("socials.instagram", soc("instagram")),
    }

TOKEN_RE = re.compile(rb"\{\{[A-Z][A-Z0-9_]{1,30}\}\}")

def check_tokens(name, data):
    """يمنع شحن رمز نائب لم يُستبدل — البنّاء يفشل بصوت عالٍ بدل نشر {{TOKEN}} حرفيًّا."""
    left = sorted(set(m.decode("ascii") for m in TOKEN_RE.findall(data)))
    if left:
        raise SystemExit("خطأ: رموز نائبة لم تُستبدل في %s ← %s" % (name, "، ".join(left)))

PANEL     = os.path.join(HERE, "panel")
PANEL_MODS= os.path.join(PANEL, "modules")

def build_stamp():
    """وقت البناء — يظهر في اللوحة كي تُعرف النسخة المُشغَّلة من صورة الشاشة.
    لا نستخدم مراجعة git لأن البناء يسبق الإيداع فتظهر المراجعة السابقة."""
    import time
    return time.strftime("%Y-%m-%d %H:%M")

def panel_real():
    """بيانات الموقع المعروفة وقت البناء — تُحقن جاهزة في اللوحة بلا انتظار شبكة."""
    real = {}
    if os.path.exists(CONTACT_F):
        with io.open(CONTACT_F, encoding="utf-8") as f:
            c = json.load(f)
        s = c.get("socials", {})
        real["settings"] = {
            "address": c.get("address_line", ""), "phone": c.get("phone_display", ""),
            "email": c.get("email", ""), "reg": c.get("license_no", ""),
            "social": {"x": s.get("x", ""), "instagram": s.get("instagram", ""),
                       "linkedin": s.get("linkedin", ""), "youtube": s.get("youtube", ""),
                       "whatsapp": s.get("whatsapp", "")},
        }
        real["social"] = real["settings"]["social"]
    real["brand"] = {"ar": "حاضنة الجمعيات",
                     "en": "ASSOCIATION INCUBATOR"}
    with io.open(DATA, encoding="utf-8") as f:
        pages = json.load(f)["pages"]
    real["pages"] = [{"id": "p" + pg["slug"], "title": pg["title"].split("|")[-1].strip(),
                      "slug": pg["slug"], "type": "محتوى",
                      "status": "منشورة"} for pg in pages]
    real["seoTitle"] = pages[0]["title"].split("|")[0].strip() if pages else ""
    # أقسام الرئيسية الفعلية بعنوانها ووصفها كما هي في المصدر
    idx = os.path.join(CONTENT, "index.main.html")
    if os.path.exists(idx):
        html = rb(idx).decode("utf-8")
        secs = []
        for m in re.finditer(rb'id="([a-z]+)"', html.encode("utf-8")):
            pass
        pat = re.compile(r'<section[^>]*id="([a-z]+)"[^>]*>.*?'
                         r'<span class="eyebrow">([^<]*)</span><h2>([^<]*)</h2>(?:<p>([^<]*)</p>)?', re.S)
        for m in pat.finditer(html):
            secs.append({"id": "s" + m.group(1), "key": m.group(1), "name": m.group(2).strip(),
                         "visible": True, "editable": True,
                         "title": m.group(3).strip(), "subtitle": (m.group(4) or "").strip()})
        if secs:
            real["sections"] = secs
    return real

def panel_name():
    """اسم ملف اللوحة مشتقّ من رابط الدخول في contact.json."""
    login = "iaq-cp-9f4b21.html"
    if os.path.exists(CONTACT_F):
        with io.open(CONTACT_F, encoding="utf-8") as f:
            login = json.load(f).get("admin_login_url") or login
    return login.replace(".html", "-panel.html")

# أيقونات شاشات القوائم — تُضاف إلى خريطة I في تصميم المدير بنفس أسلوب رسمها
SCREEN_ICONS = (
    " assembly:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"><circle cx=\"12\" cy=\"12\" r=\"2.5\"/><circle cx=\"12\" cy=\"4.3\" r=\"1.5\"/><circle cx=\"18.7\" cy=\"8.2\" r=\"1.5\"/><circle cx=\"18.7\" cy=\"15.8\" r=\"1.5\"/><circle cx=\"12\" cy=\"19.7\" r=\"1.5\"/><circle cx=\"5.3\" cy=\"15.8\" r=\"1.5\"/><circle cx=\"5.3\" cy=\"8.2\" r=\"1.5\"/></svg>',"
    " board:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"><circle cx=\"12\" cy=\"6\" r=\"2.3\"/><path d=\"M8.2 20v-2.2a3.8 3.8 0 0 1 7.6 0V20\"/><circle cx=\"4.6\" cy=\"9.6\" r=\"1.7\"/><path d=\"M2 20v-1.5a2.6 2.6 0 0 1 3.3-2.5\"/><circle cx=\"19.4\" cy=\"9.6\" r=\"1.7\"/><path d=\"M22 20v-1.5a2.6 2.6 0 0 0-3.3-2.5\"/></svg>',"
    " team:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"><circle cx=\"8.6\" cy=\"7.4\" r=\"2.6\"/><path d=\"M3.6 20v-1.7A4.4 4.4 0 0 1 8 13.9h1.4\"/><rect x=\"12.4\" y=\"12.6\" width=\"8.6\" height=\"7\" rx=\"1.6\"/><path d=\"M15.5 12.6v-1.2a1.2 1.2 0 0 1 1.2-1.2h1.4a1.2 1.2 0 0 1 1.2 1.2v1.2\"/></svg>',"
    " partners:'<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\"><circle cx=\"9.2\" cy=\"12\" r=\"5.3\"/><circle cx=\"14.8\" cy=\"12\" r=\"5.3\"/></svg>',")

# مفاتيح الشاشات كما في src/panel/screens.js — لا تتعارض مع مفاتيح التصميم
SCREEN_NAV = [
    ("assembly",    "الجمعية العمومية", "assembly"),
    ("board",       "مجلس الإدارة",     "board"),
    ("team",        "فريق العمل",       "team"),
    ("partnerlist", "الشركاء",          "partners"),
]

def build_panel(out_dir, cmap, amap):
    """يبني صفحة اللوحة من تصميم المدير كما هو، مع استبدال طبقة التخزين وحدها.

    عمليات دقيقة معدودة على الملف الأصلي، ولا شيء غيرها:
      1) بوّابة الجلسة وإعداد الاتصال في <head>.
      2) تغليف السكربت الرئيسي في دالّة تُنادى بعد وصول البيانات.
      3) load()  يقرأ من الجسر بدل الذاكرة المحلية.
      4) شاشات القوائم: أيقونات + مُدخلات القائمة الجانبية + خريطة العرض.
      5) save()  يكتب في القاعدة بدل الذاكرة المحلية.
      6) وصل ملفَّي screens.js و adapter.js قبل </body>.
      7) استبدال ad-card بـ iaq-card كي لا تحجبها مانعات الإعلانات.
    """
    src = os.path.join(PANEL, "design.html")
    if not os.path.exists(src):
        return None
    page = rb(src).decode("utf-8")
    n0 = len(page)

    supa = json.dumps(supa_cfg(), ensure_ascii=False)
    login = "iaq-cp-9f4b21.html"
    if os.path.exists(CONTACT_F):
        with io.open(CONTACT_F, encoding="utf-8") as f:
            login = json.load(f).get("admin_login_url") or login

    gate = (
        '<meta name="robots" content="noindex, nofollow, noarchive" />' + NLS +
        '<script>' + NLS +
        '(function(){var LOGIN=' + json.dumps(login) + ';var s=null;' + NLS +
        'try{s=JSON.parse(sessionStorage.getItem("iaq_session")||"null");}catch(e){}' + NLS +
        'if(!s||!s.access_token||!(s.expires_at*1000>Date.now()+5000)){' + NLS +
        'try{sessionStorage.removeItem("iaq_session");}catch(e){}location.replace(LOGIN);return;}' + NLS +
        'window.IAQ_SESSION=s;window.IAQ_SUPABASE=' + supa + ';window.IAQ_LOGIN=LOGIN;' + NLS +
        'window.IAQ_LOGOUT=function(){try{fetch(IAQ_SUPABASE.url+"/auth/v1/logout",{method:"POST",' + NLS +
        'headers:{apikey:IAQ_SUPABASE.key,Authorization:"Bearer "+s.access_token}});}catch(e){}' + NLS +
        'try{sessionStorage.removeItem("iaq_session");}catch(e){}location.replace(LOGIN);};})();' + NLS +
        'window.IAQ_REAL=' + json.dumps(panel_real(), ensure_ascii=False) + ';' + NLS +
        'window.IAQ_BUILD=' + json.dumps(build_stamp()) + ';' + NLS +
        '</script>' + NLS)

    steps = []
    # 1) البوّابة بعد العنوان (فريد، بخلاف </head>)
    a = "</title>"
    assert page.count(a) == 1, "title anchor"
    page = page.replace(a, a + NLS + gate, 1); steps.append("gate")

    # 2) تغليف السكربت الرئيسي
    a = '(function(){' + NLS + '"use strict";'
    assert page.count(a) == 1, "iife open"
    page = page.replace(a, 'window.IAQ_PANEL_MAIN=function(){' + NLS + '"use strict";', 1)
    a = "renderSidebar();switchView('dashboard');" + NLS + "})();"
    assert page.count(a) == 1, "iife close"
    page = page.replace(a, "renderSidebar();switchView('dashboard');" + NLS + "};", 1)
    steps.append("wrap")

    # 3) و4) طبقة التخزين
    a = ("function load(){try{var s=localStorage.getItem('aiSiteConfigV2');"
         "return s?JSON.parse(s):null;}catch(e){return null;}}")
    assert page.count(a) == 1, "load fn"
    page = page.replace(a,
        "function load(){var d=defaults();var i=window.IAQ_CFG_IN;"
        "if(i){for(var k in i){if(i.hasOwnProperty(k))d[k]=i[k];}}"
        "if(window.IAQ_AFTER_LOAD)window.IAQ_AFTER_LOAD(d);return d;}", 1)
    steps.append("load")

    # 5) شاشات القوائم الأربع: أيقونات، ومُدخلات في القائمة الجانبية، وخريطة العرض
    a = "var I={"
    assert page.count(a) == 1, "icon map"
    page = page.replace(a, "var I={" + NLS + SCREEN_ICONS, 1)

    a = '{group:"المحتوى"},'
    assert page.count(a) == 1, "nav group content"
    nav_add = "".join('{k:"%s",label:"%s",icon:"%s"},' % (k, lbl, ic)
                      for k, lbl, ic in SCREEN_NAV)
    page = page.replace(a, a + nav_add, 1)

    a = "var views={dashboard:vDashboard,"
    assert page.count(a) == 1, "views map"
    view_add = "".join('%s:function(){return window.IAQ_SCREENS.view("%s");},' % (k, k)
                       for k, _lbl, _ic in SCREEN_NAV)
    page = page.replace(a, "var views={" + view_add + "dashboard:vDashboard,", 1)
    steps.append("screens(%d)" % len(SCREEN_NAV))

    a = "function save(){try{localStorage.setItem('aiSiteConfigV2',JSON.stringify(config));}catch(e){}}"
    assert page.count(a) == 1, "save fn"
    page = page.replace(a, "function save(){if(window.IAQ_CFG_SAVE)window.IAQ_CFG_SAVE(config);}", 1)
    steps.append("save")

    # الجسر بعد السكربت الرئيسي
    adapter = os.path.join(PANEL, "adapter.js")
    bridge = rb(adapter).decode("utf-8") if os.path.exists(adapter) else ""
    scr = os.path.join(PANEL, "screens.js")
    if os.path.exists(scr):
        bridge = rb(scr).decode("utf-8") + NLS + bridge
    # </body> يتكرّر: الأول داخل نصّ جافاسكربت لمعاينة الأكواد. نرسو على الذيل.
    a = "</script>" + NLS + "</body>"
    assert page.count(a) == 1, "body close"
    page = page.replace(a, "</script>" + NLS + "<script>" + NLS + bridge + "</script>" + NLS + "</body>", 1)
    steps.append("bridge")

    # 6) اسم الصنف ad-card تحجبه مانعات الإعلانات (يبدأ بـ ad-)، وهو الحاوية
    #    الوحيدة لكل بطاقات اللوحة — فكانت الشاشات تبدو فارغة تمامًا للمدير.
    #    نُبدّله عند البناء فيبقى ملف التصميم كما أرسله صاحبه.
    n_ad = page.count("ad-card")
    page = page.replace("ad-card", "iaq-card")
    steps.append("unblock(%d)" % n_ad)

    data = page.encode("utf-8")
    for k, v in cmap.items():
        data = data.replace(k, v)
    for k, v in amap.items():
        data = data.replace(k, v)
    name = panel_name()
    check_tokens(name, data)
    with open(os.path.join(out_dir, name), "wb") as f:
        f.write(data)
    print("لوحة التحكّم: %s (%d من %d بايت) — %s" % (name, len(data), n0, "، ".join(steps)))
    return name

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
    team_html = render_team()
    disclosure_html = render_disclosure()
    notice_committees = render_notice("committees")
    notice_endowments = render_notice("endowments")
    about_html = render_about()
    lic_gallery = render_licenses_gallery()
    partners_html = render_partners()
    news_html = render_news()
    news_strip = render_news_strip()
    privacy_html = render_legal("privacy")
    terms_html = render_legal("terms")
    cmap = contact_map()
    amap = admin_map()
    cmap.update(files_map())
    # رموز عامة تصل الصفحات المولّدة والثابتة معًا
    cmap[b"{{ORN}}"] = ORN_HTML.encode("utf-8")
    cmap[b"{{MQ_MODE}}"] = strip_mode().encode("utf-8")
    cmap[b"{{MQ_SETS}}"] = str(MQ_SETS).encode("utf-8")

    # 1) الصفحات المُولّدة من القالب
    for pg in data["pages"]:
        slug = pg["slug"]
        head = (head_tpl
                .replace(b"{{TITLE}}", pg["title"].encode("utf-8"))
                .replace(b"{{DESC}}",  pg["desc"].encode("utf-8"))
                .replace(b"{{URL}}",   pg["url"].encode("utf-8"))
                .replace(b"{{RUNTIME}}", runtime_script(slug)))
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
        main = main.replace(b"{{TEAM_MEMBERS}}", team_html)
        main = main.replace(b"{{DISCLOSURE}}", disclosure_html)
        main = main.replace(b"{{NOTICE_COMMITTEES}}", notice_committees)
        main = main.replace(b"{{NOTICE_ENDOWMENTS}}", notice_endowments)
        main = main.replace(b"{{ABOUT_TABS}}", about_html)
        main = main.replace(b"{{LICENSES_GALLERY}}", lic_gallery)
        main = main.replace(b"{{PARTNERS}}", partners_html)
        main = main.replace(b"{{NEWS_SECTION}}", news_html)
        main = main.replace(b"{{NEWS_STRIP}}", news_strip)
        main = main.replace(b"{{PRIVACY}}", privacy_html)
        main = main.replace(b"{{TERMS}}", terms_html)
        page = head + body_tag + header + banner + main + footer
        for k, v in cmap.items():
            page = page.replace(k, v)
        check_tokens(slug + ".html", page)
        with open(os.path.join(out_dir, slug + ".html"), "wb") as f:
            f.write(page)

    # 2) الصفحات الخاصة والأصول (تُنسخ كما هي)
    for root, dirs, files in os.walk(STATIC):
        rel = os.path.relpath(root, STATIC)
        dst_root = out_dir if rel == "." else os.path.join(out_dir, rel)
        os.makedirs(dst_root, exist_ok=True)
        for name in files:
            src_f = os.path.join(root, name)
            dst_f = os.path.join(dst_root, name)
            if name.endswith(".html"):
                data_b = rb(src_f)
                for k, v in cmap.items():
                    data_b = data_b.replace(k, v)
                for k, v in amap.items():
                    data_b = data_b.replace(k, v)
                check_tokens(name, data_b)
                with open(dst_f, "wb") as fh:
                    fh.write(data_b)
            else:
                shutil.copy2(src_f, dst_f)

    # 3) تنظيف: حذف صفحات HTML قديمة في الجذر لم تعد مولّدة أو موجودة في static
    # 2-ب) لوحة التحكّم تُجمَّع من src/panel بعد نسخ الأصول
    pname = build_panel(out_dir, cmap, amap)

    # 3) تنظيف: حذف صفحات HTML قديمة في الجذر لم تعد مولّدة
    expected = set(pg["slug"] + ".html" for pg in data["pages"])
    if pname:
        expected.add(pname)
    for root, dirs, files in os.walk(STATIC):
        if os.path.relpath(root, STATIC) == ".":
            expected |= {f for f in files if f.endswith(".html")}
    removed = []
    for f in os.listdir(out_dir):
        if f.endswith(".html") and f not in expected:
            os.remove(os.path.join(out_dir, f)); removed.append(f)
    if removed:
        print("حُذفت صفحات قديمة: %s" % "، ".join(removed))

    # فهرس الصفحات للوحة التحكّم — مصدر واحد لأسماء الصفحات
    idx = [{"slug": p["slug"], "title": p["title"].split("|")[-1].strip()}
           for p in data["pages"]]
    with io.open(os.path.join(out_dir, "panel-pages.json"), "w", encoding="utf-8") as f:
        json.dump({"pages": idx}, f, ensure_ascii=False, indent=1)

    count = len(data["pages"])
    print("بُنيت %d صفحة من القالب + الأصول الثابتة إلى: %s" % (count, out_dir))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT, help="مجلد الإخراج")
    args = ap.parse_args()
    build(args.out)
