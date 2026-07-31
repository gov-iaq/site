# -*- coding: utf-8 -*-
"""
مولّد ملف تحميل المحتوى إلى Supabase
====================================
يقرأ محتوى الموقع الفعليّ من src/data/*.json ويُخرج ملف SQL واحدًا يُلصق في
Supabase → SQL Editor، فتظهر بيانات الموقع الحقيقية في لوحة التحكّم قابلةً
للتعديل والحذف والإضافة.

    python src/gen_seed.py            # يكتب supabase/seed-content.sql

كل الإدراجات upsert على مفتاح طبيعي، فتشغيل الملف مرّتين لا يُكرّر شيئًا
ولا يمسح تعديلات المدير التي أُدخلت من اللوحة على صفوف أخرى.
"""
import os, io, json

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT  = os.path.abspath(os.path.join(HERE, "..", "supabase", "seed-content.sql"))


def q(s):
    """نصّ SQL آمن: تهريب الفواصل العلوية فقط — لا نبني نصًّا من مدخلات خارجية."""
    if s is None:
        return "null"
    return "'" + str(s).replace("'", "''") + "'"


def arr(items):
    """مصفوفة نصوص PostgreSQL: text[]"""
    if not items:
        return "'{}'"
    inner = ",".join('"' + str(x).replace("\\", "\\\\").replace('"', '\\"') + '"' for x in items)
    return q("{" + inner + "}")


def jb(obj):
    """قيمة jsonb"""
    return q(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def load(name):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return None
    with io.open(p, encoding="utf-8") as f:
        return json.load(f)


def section(title):
    line = "-" * 70
    return ["", "-- " + line, "--  " + title, "-- " + line]


def gen_people():
    out = section("الأشخاص: الجمعية العمومية + مجلس الإدارة + فريق العمل")
    rows = []

    a = load("assembly-members.json")
    if a:
        for i, m in enumerate(a.get("members", [])):
            rows.append(("assembly", m.get("title", ""), m["name"], "", "member",
                         m.get("cat", ""), "", "", "", (i + 1) * 10))

    b = load("board-members.json")
    if b:
        for i, m in enumerate(b.get("members", [])):
            rows.append(("board", m.get("title", ""), m["name"], m.get("role", ""),
                         m.get("rank", "member") if m.get("rank") in ("chair", "vice", "lead") else "member",
                         "", "", "", m.get("photo", ""), (i + 1) * 10))

    t = load("team-members.json")
    if t:
        for i, m in enumerate(t.get("members", [])):
            rows.append(("team", m.get("title", ""), m["name"], m.get("role", ""),
                         m.get("rank", "member") if m.get("rank") in ("chair", "vice", "lead") else "member",
                         "", m.get("phone", ""), m.get("email", ""), m.get("photo", ""), (i + 1) * 10))

    # مفتاح تحميل مستقلّ: الاسم قد يتكرّر لشخصين مختلفين تمامًا (وهو واقع في
    # قائمة الجمعية العمومية)، فلا يصلح (grp,name) مفتاحًا. نُرقّم التكرار.
    seen = {}
    out.append("insert into public.people (seed_key,grp,title,name,role,rank,cat,phone,email,photo,sort) values")
    vals = []
    for r in rows:
        base = r[0] + "|" + r[2]
        i = seen.get(base, 0)
        seen[base] = i + 1
        vals.append("  (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%d)" % (
            q(base + "|" + str(i)),
            q(r[0]), q(r[1]), q(r[2]), q(r[3]), q(r[4]), q(r[5]), q(r[6]), q(r[7]), q(r[8]), r[9]))
    out.append(",\n".join(vals))
    out.append("on conflict (seed_key) do update set")
    out.append("  title=excluded.title, role=excluded.role, rank=excluded.rank,")
    out.append("  cat=excluded.cat, phone=excluded.phone, email=excluded.email,")
    out.append("  photo=excluded.photo, sort=excluded.sort;")
    dups = sorted(k for k, v in seen.items() if v > 1)
    if dups:
        out.append("")
        out.append("--  تنبيه: أسماء متكرّرة في ملف البيانات — أُدرجت كلها كأشخاص مستقلّين.")
        out.append("--  إن كان أحدها تكرارًا سهوًا فاحذفه من اللوحة بعد التحميل:")
        for d in dups:
            g, nm = d.split("|", 1)
            out.append("--    %s: %s  (%d مرّة)" % (g, nm, seen[d]))
    return out, len(rows)


def gen_partners():
    d = load("partners.json")
    out = section("شعارات الشركاء")
    items = (d or {}).get("partners", [])
    if not items:
        return out + ["-- لا شركاء في ملف البيانات"], 0
    out.append("insert into public.partners (name,logo,url,sort) values")
    out.append(",\n".join("  (%s,%s,%s,%d)" % (q(p["name"]), q(p.get("logo", "")),
                                               q(p.get("url", "")), (i + 1) * 10)
                          for i, p in enumerate(items)))
    out.append("on conflict (name) do update set")
    out.append("  logo=excluded.logo, url=excluded.url, sort=excluded.sort;")
    return out, len(items)


def gen_news():
    d = load("news.json")
    out = section("الأخبار")
    items = (d or {}).get("news", [])
    if not items:
        return out + ["-- لا أخبار"], 0
    out.append("insert into public.news (date,tag,title,lead,body,facts,cta_label,cta_url,image,status) values")
    vals = []
    for n in items:
        facts = n.get("facts") or []
        # في ملف البيانات: [[label, value], ...] → في القاعدة: [{label, value}, ...]
        fj = [{"label": f[0], "value": f[1]} for f in facts if isinstance(f, (list, tuple)) and len(f) == 2]
        cta = n.get("cta") or {}
        vals.append("  (%s,%s,%s,%s,%s,%s,%s,%s,%s,'published')" % (
            q(n["date"]), q(n.get("tag", "أخبار")), q(n["title"]), q(n.get("lead") or None),
            arr(n.get("body") or []), jb(fj),
            q(cta.get("label") if cta else None), q(cta.get("url") if cta else None),
            q(n.get("image", ""))))
    out.append(",\n".join(vals))
    out.append("on conflict (date, title) do update set")
    out.append("  tag=excluded.tag, lead=excluded.lead, body=excluded.body, facts=excluded.facts,")
    out.append("  cta_label=excluded.cta_label, cta_url=excluded.cta_url, image=excluded.image;")
    return out, len(items)


DOC_CATS = {"policies": "policies", "minutes": "minutes", "financials": "financials",
            "annual": "annual", "licenses": "licenses", "surveys": "surveys"}


def gen_documents():
    d = load("files.json")
    out = section("الوثائق (السجلّات فقط — الملفات نفسها تبقى في site/files/)")
    cats = (d or {}).get("categories", {})
    rows = []
    for key, items in cats.items():
        cat = DOC_CATS.get(key)
        if not cat:
            continue
        for it in items:
            rows.append((cat, it.get("title", ""), it.get("file", ""), it.get("dl_name", ""),
                         it.get("date", ""), it.get("size", ""), it.get("pages")))
    if not rows:
        return out + ["-- لا وثائق"], 0
    out.append("-- ملاحظة: storage_path هنا مسار الملف داخل الموقع، لا مسار مستودع Supabase،")
    out.append("-- لأنّ هذه الملفات مرفوعة مع الموقع أصلًا وتعمل روابطها. ما يُرفع من اللوحة")
    out.append("-- لاحقًا يُخزَّن في المستودع ويأخذ مسارًا يبدأ بالتصنيف.")
    out.append("insert into public.documents (category,title,storage_path,dl_name,doc_date,size_label,pages,status) values")
    vals = []
    for r in rows:
        pages = "null" if r[6] is None else str(int(r[6]))
        vals.append("  (%s,%s,%s,%s,%s,%s,%s,'published')" % (
            q(r[0]), q(r[1]), q(r[2]), q(r[3] or None), q(r[4]), q(r[5]), pages))
    out.append(",\n".join(vals))
    out.append("on conflict (storage_path) do update set")
    out.append("  category=excluded.category, title=excluded.title, dl_name=excluded.dl_name,")
    out.append("  doc_date=excluded.doc_date, size_label=excluded.size_label, pages=excluded.pages;")
    return out, len(rows)


def main():
    parts = [
        "-- ============================================================================",
        "--  جمعية حاضنة الجمعيات — تحميل محتوى الموقع الحالي إلى قاعدة البيانات",
        "--",
        "--  مولَّد آليًّا من src/data/*.json بواسطة src/gen_seed.py — لا تُعدّله يدويًّا.",
        "--  شغّله بعد schema.sql و schema-v2.sql و schema-v3.sql.",
        "--  آمن للتشغيل أكثر من مرة (upsert على مفاتيح طبيعية).",
        "-- ============================================================================",
    ]
    counts = {}
    for fn, key in ((gen_people, "people"), (gen_partners, "partners"),
                    (gen_news, "news"), (gen_documents, "documents")):
        block, n = fn()
        parts += block
        counts[key] = n

    parts += section("إعلان أن القاعدة هي مصدر القوائم")
    parts += [
        "-- بهذا الإعداد تُفرَّغ القائمة على الموقع فعلًا إذا أخفى المدير كل صفوفها،",
        "-- بدل أن يظهر المحذوف من البناء الثابت. لا تُشغّله قبل تحميل الصفوف أعلاه.",
        "insert into public.settings (key, value, label, is_public) values",
        "  ('lists_from_db', 'true'::jsonb,",
        "   'القوائم (الأعضاء والشركاء) مصدرها قاعدة البيانات لا ملفات البناء', true)",
        "on conflict (key) do update set value = excluded.value;",
    ]
    parts += section("تحقّق")
    parts += [
        "select 'people' as t, count(*) from public.people",
        "union all select 'partners', count(*) from public.partners",
        "union all select 'news', count(*) from public.news",
        "union all select 'documents', count(*) from public.documents;",
        "",
    ]
    with io.open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(parts))
    print("كُتب: %s" % OUT)
    for k, v in counts.items():
        print("  %-10s %d صفًّا" % (k, v))


if __name__ == "__main__":
    main()
