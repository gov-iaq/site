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
TEAM      = os.path.join(HERE, "data", "team-members.json")
DISCLOSURE= os.path.join(HERE, "data", "disclosure.json")
ABOUT     = os.path.join(HERE, "data", "about.json")
CONTACT_F = os.path.join(HERE, "data", "contact.json")
FILES_J   = os.path.join(HERE, "data", "files.json")
PARTNERS_J= os.path.join(HERE, "data", "partners.json")
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

def render_partners():
    """شعارات الشركاء في الشريط المتحرّك (مكرّرة صفّين لدوران سلس)."""
    if not os.path.exists(PARTNERS_J):
        return b""
    with io.open(PARTNERS_J, encoding="utf-8") as f:
        items = json.load(f).get("partners", [])
    if not items:
        return b""
    out = []
    for dup in (False, True):
        for p in items:
            logo = "img/partners/%s" % p["logo"]
            inner = ('<img src="%s" alt="%s" loading="lazy" decoding="async" />'
                     % (esc(logo), "" if dup else esc(p["name"])))
            attrs = ' aria-hidden="true"' if dup else ' title="%s"' % esc(p["name"])
            url = (p.get("url") or "").strip()
            if url and not dup:
                out.append('<a class="plogo" href="%s" target="_blank" rel="noopener"%s>%s</a>'
                           % (esc(url), attrs, inner))
            else:
                out.append('<div class="plogo"%s>%s</div>' % (attrs, inner))
    return "".join(out).encode("utf-8")

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
        b"{{LICENSE}}":       c.get("license_no", "").encode("utf-8"),
        b"{{CITY}}":          c.get("city", "").encode("utf-8"),
        b"{{COUNTRY}}":       c.get("country", "").encode("utf-8"),
        b"{{ADDR_SHORT}}":    c.get("address_short", "").encode("utf-8"),
        b"{{ADDR_LINE}}":     c.get("address_line", "").encode("utf-8"),
        b"{{PHONE_DISPLAY}}": c.get("phone_display", "").encode("utf-8"),
        b"{{PHONE_TEL}}":     c.get("phone_tel", "").encode("utf-8"),
        b"{{EMAIL}}":         c.get("email", "").encode("utf-8"),
        b"{{HOURS}}":         c.get("hours", "").encode("utf-8"),
        b"{{SOC_X}}":         soc("x").encode("utf-8"),
        b"{{SOC_YOUTUBE}}":   soc("youtube").encode("utf-8"),
        b"{{SOC_LINKEDIN}}":  soc("linkedin").encode("utf-8"),
        b"{{SOC_WHATSAPP}}":  soc("whatsapp").encode("utf-8"),
        b"{{SOC_INSTAGRAM}}": soc("instagram").encode("utf-8"),
    }

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
    cmap = contact_map()
    cmap.update(files_map())

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
        main = main.replace(b"{{TEAM_MEMBERS}}", team_html)
        main = main.replace(b"{{DISCLOSURE}}", disclosure_html)
        main = main.replace(b"{{NOTICE_COMMITTEES}}", notice_committees)
        main = main.replace(b"{{NOTICE_ENDOWMENTS}}", notice_endowments)
        main = main.replace(b"{{ABOUT_TABS}}", about_html)
        main = main.replace(b"{{LICENSES_GALLERY}}", lic_gallery)
        main = main.replace(b"{{PARTNERS}}", partners_html)
        page = head + body_tag + header + banner + main + footer
        for k, v in cmap.items():
            page = page.replace(k, v)
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
