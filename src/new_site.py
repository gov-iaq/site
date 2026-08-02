# -*- coding: utf-8 -*-
"""يُنشئ نسخةً نظيفةً من الموقع لجمعيةٍ أخرى.

الخطوة الميكانيكيّة وحدها: ينسخ شجرة المصدر، ويحذف من **النسخة** كل أصلٍ يخصّ
الجمعية الحالية (وثائق، وصور، وبذرة محتوى)، ويبدأ تاريخ جِت من الصفر، ويكتب
«ابدأ-هنا.md» بقائمةٍ لما تبقّى. أمّا استبدال النصوص وربط القاعدة والنطاق فتُنفَّذ
بعد ذلك بحسب «الاستنساخ.md».

لا يمسّ المصدر إطلاقًا، ولا ينفّذ شيئًا إلا بعَلَم ‎--execute‎.

    python src/new_site.py C:\\jam2                 # عرضٌ فقط، لا يكتب شيئًا
    python src/new_site.py C:\\jam2 --execute       # ينفّذ

لماذا الحذف لا النقل: ٢٤ ملفّ PDF و٤ م.ب صورًا تخصّ جمعيةً أخرى — فيها صور
تراخيصَ تحمل الرقم الوطنيّ الموحّد، وصور مجلسٍ الشعار محروقٌ فيها في البِكسل.
نقلها إلى مستودع جمعيةٍ أخرى نشرٌ لمستنداتها لا خطأ بناء.
"""
import io
import os
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)

#  لا يُنسخ: تاريخُ جِت (بياناتٌ شخصيةٌ إلى الأبد)، والمُولَّد، والوارد، والمؤقّت
SKIP_DIRS = {".git", "node_modules", "site", "_incoming", "_archive",
             "__pycache__", ".wrangler", ".venv"}
SKIP_EXT = {".pyc", ".pyo", ".log"}

#  يُحذف من النسخة: أصولٌ تخصّ الجمعية الحالية
WIPE_DIRS = [
    os.path.join("src", "static", "img", "board"),
    os.path.join("src", "static", "img", "team"),
    os.path.join("src", "static", "img", "news"),
    os.path.join("src", "static", "img", "licenses"),
    os.path.join("src", "static", "img", "partners"),
    os.path.join("src", "static", "files"),
]
WIPE_FILES = [
    os.path.join("src", "static", "favicon.png"),
    os.path.join("src", "static", "og-image.png"),
    os.path.join("supabase", "seed-content.sql"),
    "الإطلاق.md",          # مكتوبٌ على نطاق الجمعية الحالية؛ الاستنساخ.md يشرح بديله
]

START = """# ابدأ هنا — نسخةٌ نظيفة

هذا المجلّد نسخةٌ ميكانيكيّةٌ من موقع «حاضنة الجمعيات»، حُذفت منها أصولُ تلك
الجمعية. **الموقع لن يُبنى الآن** — وهذا مقصود: ملفّات البيانات ما زالت تحمل
نصوص الجمعية القديمة، والصور المحذوفة ستُشتكى.

## ما بقي عليك

اتبع **`الاستنساخ.md`** في هذا المجلّد من **الخطوة ٣** (الخطوتان ١ و٢ نفّذهما
هذا السكربت). وأهمّ ما لا يُنسى:

- [ ] **٣** — املأ `src/data/*.json` ببيانات الجمعية الجديدة
- [ ] **٤** — بدّل السلاسل المبثوثة في القوالب واللوحة (حارس الرموز لا يُنبّه عليها)
- [ ] **٥** — بدّل هاش اللوحة في **ستّة** مواضع
- [ ] **٦** — الشعار base64 في **سبع نسخٍ داخل خمسة ملفّات** + `favicon` + `og-image`
- [ ] **٧** — استورد الصور والوثائق الجديدة
- [ ] **٨** — مشروع Supabase جديد: `setup.sql` **ثم** `schema-v8.sql`
- [ ] **٩** — مستخدم Auth **ثم** صفّ `admins`
- [ ] **١٠** — `src/data/supabase.json` الجديد، و**احذف `anon_key_legacy`**
- [ ] **١١** — `python src/gen_seed.py` (لا تُشغّل بذرةً قديمة)
- [ ] **١٢** — ابنِ وافحص محليًّا
- [ ] **١٣** — **بدّل `name` في `wrangler.toml`** قبل أوّل نشرٍ مطلقًا
- [ ] **١٤–٢٠** — النطاق والإطلاق

## ثلاثة أشياء تُفسد النسخة إن نُسيت

1. **`wrangler.toml: name`** ما زال اسم العامل القديم. أوّل نشرٍ بهذا الاسم
   **يستبدل موقع الجمعية القديمة الحيّ**. غيّره أوّلًا، وتحقّق بـ`npx wrangler whoami`.
2. **`donate_url`** في `src/data/contact.json` ما زال متجر تبرّعات الجمعية القديمة
   — زرّ «ادعمنا» سيحوّل الأموال إلى جهةٍ أخرى.
3. **`anon_key_legacy`** في `src/data/supabase.json` يحمل مرجع المشروع القديم
   **داخل حمولة JWT بترميز base64** — فبحثٌ نصّيٌّ عن معرّف المشروع لا يجده،
   والبنّاء يستعمله احتياطًا لو فرغ `publishable_key`.

## فحصٌ سريعٌ متى شئت

```bash
git grep -c "حاضنة الجمعيات" -- src     # يجب أن يصير 0
git grep -n "iaq\\.org\\.sa\\|iaq\\.sa" -- src
git grep -n "iaq-cp-9f4b21" .
grep -n '^name' wrangler.toml
```
"""


def human(n):
    for u in ("بايت", "ك.ب", "م.ب"):
        if n < 1024 or u == "م.ب":
            return "%.1f %s" % (n, u)
        n /= 1024.0


def tree_size(p):
    t = c = 0
    for root, _, fs in os.walk(p):
        for f in fs:
            try:
                t += os.path.getsize(os.path.join(root, f))
                c += 1
            except OSError:
                pass
    return t, c


def copy_tree(src, dst, act):
    """نسخٌ انتقائيّ: يتجاوز ما في SKIP_*. يعيد (عدد الملفّات، الحجم)."""
    n = sz = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, src)
        out = dst if rel == "." else os.path.join(dst, rel)
        if act:
            os.makedirs(out, exist_ok=True)
        for f in files:
            if os.path.splitext(f)[1].lower() in SKIP_EXT:
                continue
            s = os.path.join(root, f)
            try:
                sz += os.path.getsize(s)
            except OSError:
                continue
            n += 1
            if act:
                shutil.copy2(s, os.path.join(out, f))
    return n, sz


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    act = "--execute" in sys.argv
    if not args:
        print(__doc__)
        return 2
    dst = os.path.abspath(args[0])

    #  حمايات: لا نلمس المصدر، ولا نكتب فوق مجلّدٍ عامر
    if os.path.normcase(dst) == os.path.normcase(SRC):
        print("توقّف: الهدف هو المصدر نفسه.")
        return 1
    if os.path.normcase(dst).startswith(os.path.normcase(SRC) + os.sep):
        print("توقّف: الهدف داخل المصدر — سيُنسخ في نفسه.")
        return 1
    if os.path.isdir(dst) and os.listdir(dst):
        print("توقّف: %s موجودٌ وغير فارغ. اختر مسارًا جديدًا." % dst)
        return 1

    print("المصدر: %s" % SRC)
    print("الهدف : %s" % dst)
    print("الوضع : %s" % ("تنفيذ" if act else "عرضٌ فقط (أضِف --execute للتنفيذ)"))
    print("=" * 62)

    n, sz = copy_tree(SRC, dst, act)
    print("١) النسخ: %d ملفًّا · %s" % (n, human(sz)))
    print("   (تُجوهزت: %s)" % " ".join(sorted(SKIP_DIRS)))

    print("\n٢) حذف أصول الجمعية الحالية من النسخة:")
    freed = fn = 0
    for d in WIPE_DIRS:
        p = os.path.join(dst, d)
        ref = os.path.join(SRC, d)
        if not os.path.isdir(ref):
            continue
        s, c = tree_size(ref)
        freed += s
        fn += c
        print("   %-38s %3d ملفًّا · %s" % (d.replace(os.sep, "/"), c, human(s)))
        if act and os.path.isdir(p):
            shutil.rmtree(p)
            os.makedirs(p, exist_ok=True)      # يبقى المجلّد ليستقبل الجديد
    for f in WIPE_FILES:
        ref = os.path.join(SRC, f)
        if not os.path.exists(ref):
            continue
        s = os.path.getsize(ref)
        freed += s
        fn += 1
        print("   %-38s %s" % (f.replace(os.sep, "/"), human(s)))
        if act:
            p = os.path.join(dst, f)
            if os.path.exists(p):
                os.remove(p)
    print("   المجموع: %d ملفًّا · %s" % (fn, human(freed)))

    print("\n٣) ابدأ-هنا.md")
    if act:
        io.open(os.path.join(dst, "ابدأ-هنا.md"), "w",
                encoding="utf-8", newline="\n").write(START)
        print("   كُتب")
    else:
        print("   سيُكتب (%d حرفًا)" % len(START))

    print("\n٤) تاريخ جِت من الصفر")
    if act:
        try:
            for cmd in (["git", "init", "-q"],
                        ["git", "add", "-A"],
                        ["git", "commit", "-q", "-m", "أساس الموقع — نسخةٌ نظيفة"]):
                subprocess.run(cmd, cwd=dst, check=True,
                               capture_output=True, text=True)
            r = subprocess.run(["git", "log", "--oneline"], cwd=dst,
                               capture_output=True, text=True)
            print("   %s" % r.stdout.strip())
        except Exception as e:
            print("   تعذّر (%s) — نفّذها يدويًّا: git init && git add -A && git commit" % e)
    else:
        print("   git init && git add -A && git commit")

    print("\n" + "=" * 62)
    if act:
        print("تمّت النسخة. افتح محادثةً جديدة في %s واتبع «ابدأ-هنا.md»." % dst)
        print("ولا تنشر قبل تبديل name في wrangler.toml.")
    else:
        print("لم يُكتب شيء. أعِد الأمر مع --execute للتنفيذ.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
