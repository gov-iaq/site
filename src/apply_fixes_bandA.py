# -*- coding: utf-8 -*-
"""
إصلاحات الإطلاق (البند أ) — تُطبَّق على مصدر الموقع في src/.
كل تعديل يتحقّق أولاً من وجود النص الأصلي بالعدد المتوقّع، فإن اختلّ أي عدّاد
تتوقّف العملية دون كتابة أي ملف (آمنة وقابلة للمراجعة).
شغّلها مرة واحدة، ثم أعِد البناء: python src/build.py
"""
import os, io, sys

SRC = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(SRC, "content")
T = os.path.join(SRC, "templates")

def P(*a): return os.path.join(*a)

# --- تعريف الإصلاحات: (المسار, النص القديم, النص الجديد, العدد المتوقّع) ---
edits = []

# 1) إصلاح مسار التنقّل (breadcrumb): إزالة تكرار "cur" وإضافة الفاصل
BREADCRUMBS = [
    ("about.banner.html",      "من نحن",  "عن الجمعية"),
    ("assembly.banner.html",   "من نحن",  "الجمعية العمومية"),
    ("board.banner.html",      "من نحن",  "مجلس الإدارة"),
    ("committees.banner.html", "من نحن",  "اللجان الفرعية"),
    ("endowments.banner.html", "من نحن",  "الأوقاف والاستثمارات"),
    ("licenses.banner.html",   "من نحن",  "التراخيص"),
    ("team.banner.html",       "من نحن",  "فريق العمل"),
    ("jobs.banner.html",       "الخدمات", "الوظائف"),
    ("membership.banner.html", "الخدمات", "طلب العضوية"),
    ("volunteer.banner.html",  "الخدمات", "تطوّع معنا"),
]
for fn, group, cur in BREADCRUMBS:
    old = '<span class="cur">%s</span><span class="cur">%s</span>' % (group, cur)
    new = '<span>%s</span><span class="sep">/</span><span class="cur">%s</span>' % (group, cur)
    edits.append((P(C, fn), old, new, 1))

# 2) الرئيسية: إصلاح رابطين معطّلين في الواجهة (hero)
edits.append((P(C, "index.main.html"),
              'href="#contact" class="btn btn-ghost">تواصل معنا',
              'href="contact.html" class="btn btn-ghost">تواصل معنا', 1))
edits.append((P(C, "index.main.html"),
              'href="#" class="btn btn-ghost">الخدمات الإلكترونية',
              'href="volunteer.html" class="btn btn-ghost">الخدمات الإلكترونية', 1))

# 3) الأخبار: تعطيل روابط "اقرأ المزيد" (6) وإزالة ترقيم الصفحات الوهمي
NEWS_MORE = ('<a href="#" class="news-more">اقرأ المزيد<svg viewBox="0 0 24 24" '
             'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" '
             'stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg></a>')
edits.append((P(C, "news.main.html"), NEWS_MORE, "", 6))
NEWS_PAGER = ('<nav class="pager" aria-label="ترقيم الصفحات"><a href="#" class="active">1</a>'
              '<a href="#">2</a><a href="#">3</a><a href="#" aria-label="التالي">'
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
              'stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></a></nav>')
edits.append((P(C, "news.main.html"), NEWS_PAGER, "", 1))

# 4) الوظائف: تعبئة القائمة المنسدلة تلقائيًا عند الضغط على "التقديم على الوظيفة"
JOBS_SCRIPT = ('<script>(function(){var sel=document.getElementById("j_pos");'
               'document.querySelectorAll("article.card .program-link").forEach(function(a){'
               'a.addEventListener("click",function(){var card=a.closest("article.card"),'
               'h=card&&card.querySelector("h3");if(sel&&h)sel.value=h.textContent.trim();});});})();</script>')
edits.append((P(C, "jobs.main.html"), "</main>", JOBS_SCRIPT + "</main>", 1))

# 5) استبيانات الرضا: جعل اختيار التقييم مطلوبًا (منع الإرسال الفارغ)
edits.append((P(C, "satisfaction.main.html"), 'type="radio"', 'type="radio" required', 60))

# 6) الشيفرة المشتركة (footer): دعم التحقّق من مجموعات الراديو + تنظيف خانة تحليلات Cloudflare
edits.append((P(T, "footer.html"),
              "var fld=f.closest('.field');",
              "var fld=f.closest('.field')||f.closest('.survey-q');", 2))
edits.append((P(T, "footer.html"),
              "if(f.type==='checkbox')bad=!f.checked;else if(f.type==='email')",
              "if(f.type==='checkbox')bad=!f.checked;else if(f.type==='radio')bad=!form.querySelector('input[name=\"'+f.name+'\"]:checked');else if(f.type==='email')",
              1))
BEACON_OLD = ('<!-- <script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
              'data-cf-beacon=\'{"token":"ضع-التوكن-هنا"}\'></script> -->')
BEACON_NEW = ('<!-- تحليلات Cloudflare Web Analytics: بعد إنشاء حساب Cloudflare وتفعيل Web Analytics، '
              'ضع التوكن مكان PUT-CF-TOKEN-HERE ثم أزِل علامتَي التعليق حول سطر <script> التالي (يسري على كل الصفحات بعد إعادة البناء) -->\n'
              '<!-- <script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
              'data-cf-beacon=\'{"token":"PUT-CF-TOKEN-HERE"}\'></script> -->')
edits.append((P(T, "footer.html"), BEACON_OLD, BEACON_NEW, 1))

# 7) الرأس المشترك (head): تنسيق تنبيه الخطأ لأسئلة الاستبيان
CSS_OLD = '.survey-q .qt{font-weight:700;color:var(--ink);margin-block-end:14px}'
CSS_NEW = CSS_OLD + '\n.survey-q.err{border-color:#d0653f;box-shadow:0 0 0 3px rgba(208,101,63,.12)}'
edits.append((P(T, "head.html"), CSS_OLD, CSS_NEW, 1))

# ---- المرحلة 1: التحقّق من كل العدّادات قبل الكتابة ----
files = {}
problems = []
for path, old, new, cnt in edits:
    if path not in files:
        with io.open(path, encoding="utf-8", newline="") as f:
            files[path] = f.read()
    actual = files[path].count(old)
    if actual != cnt:
        problems.append("  [%s] expected %d occurrence(s) of a target, found %d: %.50r"
                        % (os.path.basename(path), cnt, actual, old))

if problems:
    print("ABORT — target mismatch, nothing written:")
    print("\n".join(problems))
    sys.exit(1)

# ---- المرحلة 2: تطبيق كل التعديلات في الذاكرة ثم الكتابة ----
for path, old, new, cnt in edits:
    files[path] = files[path].replace(old, new)

for path, text in files.items():
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)

print("OK — applied %d edits across %d files:" % (len(edits), len(files)))
for path in files:
    print("  updated", os.path.relpath(path, SRC))
