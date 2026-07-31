/* ============================================================================
   قائمة الشركاء — صفوف جدول public.partners: إضافة، تعديل، ترتيب، إخفاء، حذف،
   ورفع شعار إلى مستودع iaq-media.

   حقائق تحقّقتُها من مصدر الموقع نفسه لا من الذاكرة، والواجهة تقولها كما هي:
   • هذا الجدول يُقرأ حيًّا وقت العرض. الملف src/templates/iaq-lists.js — الذي
     يحقنه build.py في كل صفحة داخل نفس وسم <script> مع iaq-runtime.js (انظر
     runtime_script) — يطلب في الصفحة الرئيسة:
       partners?select=name,logo,url,sort&status=eq.published&order=sort.asc,id.asc
     ثم يُعيد بناء شعارات الشريط داخل العنصر #partnersTrack. فما يُحفظ هنا يصل
     الزائر عند أوّل تحميل للصفحة الرئيسة، بلا إعادة بناء ولا نشر.
   • حدود ذلك، وكلّها مذكورة في تنبيه الشاشة: «منشور» وحده يُقرأ علنًا؛ وإن رجع
     الطلب بلا صفوف أو سقطت الشبكة بقي الشريط الثابت كما هو — الطبقة لا تُفرّغ
     الشريط أبدًا؛ والعنصر #partnersTrack موجود في site/index.html وحدها.
   • النسخة الثابتة تُبنى وقت التوليد من src/data/partners.json عبر build.py،
     وهي ما يظهر قبل وصول الجواب. وهذه الشاشة لا تكتب في ذلك الملف، فالنسخة
     الثابتة لا تتغيّر قبل تحديث الملف وإعادة البناء.
   • شاشة «شريط الشركاء» (30-partners.js) تضبط نمط حركة الشريط في جدول settings
     (والسرعة تُخزَّن هناك لكن صفحات الموقع لا تقرؤها بعد) — شأن آخر لا يخصّ
     محتوى هذه القائمة.
   • مخطّط الجدول (schema-v3): logo و url من نوع text not null default ''،
     فنُرسل نصًّا فارغًا لا null. و sort من نوع int not null default 100،
     و updated_by من نوع text يقبل الفراغ.
   • على العمود name فهرس فريد (partners_name_idx) → الاسم المكرّر يرجع 409.
   • مُطلِق partners_touch يحدّث updated_at عند كل تعديل، فلا نرسله من هنا.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة لا خطأً — نعرض «لا توجد
     بيانات» ولا نُسمّي غياب الصفوف عطلًا.
   • مستودع iaq-media علنيّ القراءة (schema-v2)، فرابط الشعار المرفوع منه يعمل
     فورًا بلا توقيع ولا صلاحية.
   • الترتيب في الشريط وفي هذه الشاشة واحد: order by sort asc, id asc. ولذلك
     لا يكفي تبديل قيمتَي جارين إن كانت في النافذة قيم متساوية — تفصيل ذلك في
     تعليق قسم الترتيب أدناه.
   • الشاشة تُعاد بالكامل عند كل رسم، فلا مستمع على عنصر نرسمه: كل زرّ عبر
     data-act، وحقل الملف عبر مستمع واحد على المستند.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var KEY = 'partnerlist';
  var TBL = 'partners';
  var BUCKET = 'iaq-media';
  var DIR = 'img/partners/';          // المجلّد الذي تُحلّ فيه الأسماء المجرّدة
  var LIM = 200;
  var STEP = 10;                      // خطوة القيم عند إعادة الترقيم

  var STATUS = [
    { v: 'published', t: 'منشور' },
    { v: 'draft', t: 'مسودّة' },
    { v: 'hidden', t: 'مخفي' }
  ];

  /* الصيغ المقبولة للشعار، وخريطة النوع إلى امتداد حين يأتي الملف بلا امتداد */
  var IMG_EXT = { png: 1, jpg: 1, jpeg: 1, webp: 1, gif: 1, svg: 1, avif: 1 };
  var MIME_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif'
  };

  /* حالة الشاشة داخل الغلاف — لا متغيّر عامّ */
  var mode = 'list';        // 'list' أو 'form'
  var editId = null;        // معرّف الشريك عند التعديل، أو null للإضافة
  var internal = false;     // هل جاء الرسم من تنقّل داخليّ لهذه الوحدة؟
  var busy = false;         // رفع جارٍ — نمنع رفعين متوازيين
  var rows = [];            // آخر ما قُرئ فعلًا من القاعدة (للعرض ولأسماء الرسائل)

  /* ------------------------------- أيقونات ------------------------------- */
  var IC_LIST = '<rect x="3" y="4" width="7" height="7" rx="1.6"/>' +
                '<rect x="14" y="4" width="7" height="7" rx="1.6"/>' +
                '<rect x="3" y="13" width="7" height="7" rx="1.6"/>' +
                '<rect x="14" y="13" width="7" height="7" rx="1.6"/>';
  var IC_EDIT = '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>';
  var IC_UP   = '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>';
  var IC_DOWN = '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>';
  var IC_PUB  = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>';
  var IC_HIDE = '<path d="M3 3l18 18"/>' +
                '<path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8"/>' +
                '<path d="M6.2 7.9A17 17 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 3.4-.6"/>';
  var IC_DEL  = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
  var SVG_UP  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
                'stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';

  /* ------------------------------ أدوات صغيرة ------------------------------ */

  /* معرّف صحيح موجب أو null — لا نبني استعلامًا بمعرّف لم يُتحقّق منه */
  function toInt(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
    return n;
  }
  function val(sel) {
    var el = U.$(sel);
    return el ? String(el.value == null ? '' : el.value) : '';
  }
  function trimmed(sel) { return val(sel).replace(/^\s+|\s+$/g, ''); }
  function msg(e) { return (e && e.message) ? e.message : 'فشل الإجراء'; }
  function boom(e) { U.toast(msg(e), 'err'); }
  function who() { return (IAQ.me && IAQ.me.email) || null; }
  function nameOf(r) { return String((r && r.name) || ''); }

  function statusText(s) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === s) return STATUS[i].t;
    return String(s == null ? '—' : s);
  }
  function statusOk(s) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === s) return true;
    return false;
  }

  /* الشعار يقبل شكلين: اسم ملف مجرّد يُحلّ على img/partners/، أو رابطًا كاملًا */
  function isUrl(s) { return /^(?:https?:)?\/\//i.test(String(s || '')); }
  function logoSrc(logo) { return isUrl(logo) ? String(logo) : DIR + String(logo); }

  /* اسم لاتينيّ آمن لمفتاح الكائن — الاسم العربيّ يصبح فارغًا بعد التنقية
     فنستعمل بديلًا محايدًا بدل مفتاح مكوّن من نسب مئوية طويلة */
  function asciiSlug(name) {
    var base = String(name == null ? '' : name).replace(/\.[A-Za-z0-9]{1,6}$/, '');
    var s = base.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+/g, '-')
                .replace(/^-/, '').replace(/-$/, '').toLowerCase();
    if (s.length > 48) s = s.slice(0, 48).replace(/-$/, '');
    if (s.length < 2) s = 'logo';
    return s;
  }
  function extOf(f) {
    var m = /\.([A-Za-z0-9]{1,6})$/.exec(String(f.name || ''));
    var e = m ? m[1].toLowerCase() : '';
    if (e === 'jpeg') e = 'jpg';
    if (IMG_EXT[e]) return e;
    return MIME_EXT[String(f.type || '').toLowerCase()] || '';
  }

  function idxIn(list, id) {
    var s = String(id);
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === s) return i;
    return -1;
  }
  /* قيمة ترتيب رقمية أو null. المخطّط يجعل sort not null default 100،
     فالفرع الفارغ دفاعيّ فقط لقاعدة أُنشئت بمخطّط أقدم. */
  function sortOf(r) {
    if (r == null || r.sort == null || r.sort === '') return null;
    var n = Number(r.sort);
    return isFinite(n) ? Math.round(n) : null;
  }
  /* هل كل قيم الترتيب في النافذة موجودة ومتمايزة؟ إن كانت كذلك فالترتيب محسومٌ
     بالقيمة وحدها، ويكفي تبديل قيمتَي جارين. */
  function allDistinct(list) {
    var seen = {}, i, v, k;
    for (i = 0; i < list.length; i++) {
      v = sortOf(list[i]);
      if (v == null) return false;
      k = 'k' + v;
      if (seen[k]) return false;
      seen[k] = 1;
    }
    return true;
  }

  /* ------------------------- التنبيهات الإلزاميّة ------------------------- */

  /* مدى الوصول — مقروء من مصدر الموقع لا مُفترَض */
  function reachNotice() {
    return U.notice(
      '<b>ما تُغيّره هذه القائمة يظهر للزائر في شريط الصفحة الرئيسة عند أوّل تحميل لها — ' +
      'بلا إعادة بناء ولا نشر.</b><br>' +
      'شريط شعارات «شركاء النجاح» يُبنى ثابتًا وقت التوليد من ' +
      '<span class="mono">src/data/partners.json</span> عبر <span class="mono">build.py</span>، ' +
      'لكن طبقة القوائم الحيّة المحقونة في صفحات الموقع ' +
      '(<span class="mono">src/templates/iaq-lists.js</span>) تطلب في الصفحة الرئيسة ' +
      '<span class="mono" dir="ltr">partners?select=name,logo,url,sort&amp;status=eq.published' +
      '&amp;order=sort.asc,id.asc</span> وتُعيد بناء شعارات الشريط من هذه الصفوف. ' +
      'فالإضافة والتعديل والنشر والإخفاء وإعادة الترتيب والحذف تصل الزائر بمجرّد تحميله ' +
      'الصفحة الرئيسة من جديد.<br>' +
      'وهذه حدودها الأربعة كما هي في المصدر: ' +
      '<b>١)</b> «منشور» وحده يُقرأ علنًا — المسودّة والمخفي لا يراهما الزائر. ' +
      '<b>٢)</b> إن لم يرجع أي صفّ منشور، أو تعذّر الطلب، بقي الشريط الثابت كما هو؛ ' +
      'فإخفاء الشركاء جميعًا أو حذفهم لا يُفرّغ الشريط بل يُرجعه إلى محتوى الملف الثابت. ' +
      '<b>٣)</b> الشريط موجود في الصفحة الرئيسة وحدها ' +
      '(<span class="mono">#partnersTrack</span> في <span class="mono">index.html</span>). ' +
      '<b>٤)</b> هذه الشاشة لا تكتب في <span class="mono">partners.json</span>، فالنسخة الثابتة — ' +
      'وهي ما يُرى في أوّل جزء من الثانية قبل وصول الجواب — لا تتغيّر قبل تحديث الملف وإعادة البناء. ' +
      'والصفحة المفتوحة أصلًا لا تتبدّل قبل إعادة تحميلها.'
    );
  }

  /* شكلا حقل الشعار — الشكلان مقبولان فعلًا، والفرق بينهما مذكور صريحًا */
  function logoNotice() {
    return U.notice(
      '<b>حقل الشعار يقبل شكلين، وكلاهما يعمل في الشريط الحيّ:</b><br>' +
      '١) <b>اسم ملف مجرّد</b> مثل <span class="mono">alrajhi-foundation.png</span> — تكتبه الطبقة ' +
      'الحيّة كما هو مسبوقًا بـ <span class="mono">' + U.esc(DIR) + '</span>، فيجب أن يكون الملف ' +
      'موجودًا فعلًا في <span class="mono">site/img/partners/</span> ضمن الموقع المنشور، وإلا ظهر ' +
      'مكان الشعار فارغًا. هذه الشاشة لا ترفع ملفًّا إلى مجلّد الموقع.<br>' +
      '٢) <b>رابط كامل</b> يبدأ بـ <span class="mono">https://</span> — مثل الرابط الذي يُنتجه الرفع ' +
      'أدناه: الصورة تُخزَّن في مستودع <span class="mono">iaq-media</span> العلنيّ ويُسجَّل صفّها في ' +
      'جدول <span class="mono">media</span>، فرابطها يعمل فورًا بلا إرفاق ملف بالبناء. ' +
      'والشكلان معًا يظهران في النسخة الحيّة من الشريط؛ أمّا النسخة الثابتة المبنيّة من ' +
      '<span class="mono">partners.json</span> فلا تعرف إلا ما في ذلك الملف.'
    );
  }

  /* السطر الوحيد الذي يشير إلى شاشة نمط الحركة — بلا تكرار لعملها */
  function stripLine() {
    return '<p class="muted small">نمط حركة الشريط (شريط متصل / تحريك يدوي / تبديل بالتلاشي) ' +
      'يُضبط في شاشة «شريط الشركاء» لا من هنا — وهي تخصّ الحركة وحدها لا الشعارات. ' +
      '<button class="btn ghost sm" data-act="partnerlist-strip">افتح شريط الشركاء</button></p>';
  }

  /* ------------------------------ شاشة القائمة ------------------------------ */

  function tile(r, i, n) {
    var pub = (r.status === 'published');
    var logo = String(r.logo == null ? '' : r.logo);
    var nm = nameOf(r);

    var img = logo
      ? '<img src="' + U.esc(logoSrc(logo)) + '" alt="' + U.esc(nm) + '" loading="lazy">'
      : '<span class="muted" title="لا شعار في هذا الصفّ">—</span>';

    var acts = '';
    if (!pub) {
      /* نُسمّي الحالة كما هي في القاعدة: «مسودّة» ليست «مخفي» */
      acts += '<span class="chip" title="لا يقرؤها الزائر — القراءة العلنية للمنشور وحده">' +
        U.esc(statusText(r.status)) + '</span>';
    }
    acts += U.iconBtn('partnerlist-edit', IC_EDIT, { id: r.id, sm: true, label: 'تعديل' });
    if (i > 0) {
      acts += U.iconBtn('partnerlist-move', IC_UP, { id: r.id, arg: 'up', sm: true, label: 'تقديم' });
    }
    if (i < n - 1) {
      acts += U.iconBtn('partnerlist-move', IC_DOWN, { id: r.id, arg: 'down', sm: true, label: 'تأخير' });
    }
    acts += U.iconBtn('partnerlist-toggle', pub ? IC_HIDE : IC_PUB,
      { id: r.id, arg: pub ? 'hidden' : 'published', sm: true,
        label: pub ? 'إخفاء' : 'نشر' });
    acts += U.iconBtn('partnerlist-del', IC_DEL, { id: r.id, sm: true, danger: true, label: 'حذف' });

    return '<div class="media-item"' + (pub ? '' : ' style="opacity:.62"') + '>' +
      '<div class="mi-img">' + img + '</div>' +
      '<div class="mi-name" title="' + U.esc(nm) + '">' +
        U.esc(F.cut(nm, 30) || '(بلا اسم)') + '</div>' +
      '<div class="mi-acts" style="flex-wrap:wrap">' + acts + '</div>' +
      '</div>';
  }

  function gridHtml() {
    var n = rows.length;
    return '<div class="media-grid">' + rows.map(function (r, i) {
      return tile(r, i, n);
    }).join('') + '</div>';
  }

  function renderList(mount) {
    return A.select(TBL, 'select=*&order=sort.asc,id.asc&limit=' + LIM).then(function (rs) {
      rows = rs || [];

      var pubN = 0, i;
      for (i = 0; i < rows.length; i++) if (rows[i].status === 'published') pubN++;

      var body = rows.length ? gridHtml() : U.empty('لا توجد بيانات');
      var foot = '<button class="btn ghost" data-act="partnerlist-reload">إعادة القراءة من القاعدة</button>' +
        '<button class="btn" data-act="partnerlist-new">شريك جديد</button>';

      mount.innerHTML =
        U.head('قائمة الشركاء', 'شعارات شركاء النجاح وأسماؤهم وروابطهم وترتيبهم في جدول partners') +
        reachNotice() + logoNotice() + stripLine() +
        U.card('الشعارات (' + F.num(rows.length) + ')', body, foot) +
        '<p class="muted small">يُعرض حتى ' + F.num(LIM) + ' صفًّا مرتّبة بالعمود ' +
        '<span class="mono">sort</span> تصاعديًّا ثم بالمعرّف — وهو نفس ترتيب الشريط الحيّ في ' +
        'الصفحة الرئيسة. الأعداد المذكورة هي عدد الصفوف المُحمَّلة فعليًا (' +
        F.num(rows.length) + ' صفًّا، منها ' + F.num(pubN) + ' بحالة «منشور») لا العدد الكلّي ' +
        'في الجدول. الشريك الجديد يأخذ <span class="mono">sort = 100</span> من إعداد الجدول، ' +
        'فإن تشابهت قيم الترتيب بين صفوف فُكّ التشابه بالمعرّف الأقدم. وأسهم التقديم والتأخير ' +
        'تبدّل قيمتَي الصفّ وجاره حين تكون كل القيم المقروءة موجودة ومتمايزة؛ وإن وُجد تشابه ' +
        'أو قيمة فارغة فالتبديل وحده لا يكفي (التشابه يُفكّ بالمعرّف لا بالقيمة)، فتُكتب قيم ' +
        'جديدة لأقلّ عدد ممكن من الصفوف حتى تصير القيم متمايزة — وإن زاد عددها على صفّين ' +
        'سُئلتَ قبل الكتابة، ويُذكر بعدها عدد الصفوف التي كُتبت فعلًا. الكتابة متسلسلة، ' +
        'وتُحسب على قراءة جديدة من القاعدة لا على المعروض، وتمسّ الصفوف المقروءة وحدها.</p>';
    });
  }

  /* ------------------------------ شاشة النموذج ------------------------------ */

  function statusSelect(cur) {
    return '<select id="partnerlist-status">' + STATUS.map(function (s) {
      return '<option value="' + U.esc(s.v) + '"' + (cur === s.v ? ' selected' : '') + '>' +
        U.esc(s.t) + '</option>';
    }).join('') + '</select>';
  }

  function prevHtml(logo) {
    if (!logo) return '<span class="muted small">لا شعار محدّد بعد.</span>';
    return '<img src="' + U.esc(logoSrc(logo)) + '" alt="" style="max-height:48px;max-width:130px">' +
      '<span class="mono">' + U.esc(F.cut(logo, 46)) + '</span>';
  }
  function paintPrev(logo) {
    var b = U.$('#partnerlist-prev');
    if (b) b.innerHTML = prevHtml(logo);
  }
  function setUp(html) {
    var b = U.$('#partnerlist-up');
    if (b) b.innerHTML = html || '<span class="muted small">لم يُرفع شعار في هذه الجلسة.</span>';
  }

  /* خطأ داخل النموذج — نصّ عربيّ ظاهر مكان الحدث لا تنبيه عابر وحده */
  function inlineErr(title, detail) {
    var b = U.$('#partnerlist-err');
    if (!b) return;
    b.innerHTML = title
      ? U.notice('<b>' + U.esc(title) + '</b>' + (detail ? '<br>' + U.esc(detail) : ''))
      : '';
  }

  function formHtml(r) {
    r = r || {};
    var isEdit = !!r.id;
    var logo = String(r.logo == null ? '' : r.logo);

    var g1 = '<div class="grid2">' +
      '<div class="fld"><label for="partnerlist-name">اسم الشريك</label>' +
        '<input type="text" id="partnerlist-name" value="' + U.esc(r.name || '') +
        '" placeholder="مؤسسة … الخيرية">' +
        '<span class="muted small">مطلوب. وعلى هذا العمود فهرس فريد في القاعدة، ' +
        'فاسم مستخدم في صفّ آخر يُرفض بتعارض ولا يُحفظ. والاسم يظهر للزائر في تلميح الشعار ' +
        'وفي بديل الصورة.</span></div>' +
      '<div class="fld"><label for="partnerlist-status">الحالة</label>' +
        statusSelect(statusOk(r.status) ? r.status : 'published') +
        '<span class="muted small">«منشور» وحده يقرؤه الزائر في الشريط الحيّ؛ ' +
        '«مسودّة» و«مخفي» يبقيان للمدراء.</span></div>' +
      '</div>';

    var g2 = '<div class="fld"><label for="partnerlist-logo">الشعار — اسم ملف مجرّد أو رابط كامل</label>' +
      '<input type="text" id="partnerlist-logo" value="' + U.esc(logo) +
      '" placeholder="alrajhi-foundation.png" dir="ltr">' +
      '<span class="muted small">اسم مجرّد يُحلّ على <span class="mono">' + U.esc(DIR) +
      '</span>، أو رابط كامل يبدأ بـ <span class="mono">https://</span> ' +
      '(الرفع أدناه يضع الرابط الكامل هنا). اتركه فارغًا فيُخزَّن نصًّا فارغًا ' +
      'وتظهر البطاقة بشُرطة بلا صورة.</span></div>' +
      '<div class="prow" id="partnerlist-prev">' + prevHtml(logo) + '</div>' +
      '<div class="fld"><label for="partnerlist-url">رابط الشريك (اختياري)</label>' +
      '<input type="text" id="partnerlist-url" value="' + U.esc(r.url || '') +
      '" placeholder="https://example.org" dir="ltr">' +
      '<span class="muted small">إن وُضع رابط جُعل الشعار في الشريط وصلة تُفتح في تبويب جديد ' +
      '(<span class="mono">target=_blank rel=noopener</span>)، وإن تُرك فارغًا عُرض الشعار ' +
      'بلا وصلة. والطبقة الحيّة تضع هذه القيمة كما هي في خاصية ' +
      '<span class="mono">href</span> على الصفحة الرئيسة، فلا نقبل إلا رابطًا يبدأ بـ ' +
      '<span class="mono">https://</span> أو <span class="mono">http://</span>.</span></div>';

    var up = '<label class="upload big">' + SVG_UP +
        '<span>ارفع صورة شعار من جهازك</span>' +
        '<input type="file" id="partnerlist-file" accept="image/*" hidden>' +
      '</label>' +
      '<div class="prow" id="partnerlist-up"><span class="muted small">لم يُرفع شعار في هذه الجلسة.</span></div>' +
      '<p class="muted small">اختيار الملف يبدأ الرفع فورًا إلى مستودع ' +
      '<span class="mono">' + U.esc(BUCKET) + '</span> على المسار ' +
      '<span class="mono">partners/&lt;الطابع الزمني&gt;-&lt;اسم لاتينيّ&gt;</span>، ثم يُسجَّل ' +
      'صفّ في جدول <span class="mono">media</span>، ثم يُوضع الرابط العلنيّ في حقل الشعار أعلاه. ' +
      'الرفع وحده لا يحفظ الشريك — اضغط الحفظ بعده. الصيغ المقبولة: ' +
      '<span class="mono">png jpg webp gif svg avif</span>.</p>';

    var foot = '<button class="btn ghost" data-act="partnerlist-cancel">إلغاء</button>' +
      '<button class="btn" data-act="partnerlist-save"' +
      (isEdit ? ' data-id="' + U.esc(r.id) + '"' : '') + '>' +
      (isEdit ? 'حفظ التعديلات' : 'إضافة الشريك') + '</button>';

    var meta = isEdit
      ? '<p class="muted small mono">#' + U.esc(r.id) + ' · sort: ' +
        U.esc(r.sort == null ? '—' : String(r.sort)) +
        ' · أُنشئ: ' + U.esc(F.date(r.created_at)) +
        (r.updated_at ? ' · آخر تعديل: ' + U.esc(F.date(r.updated_at)) : '') +
        (r.updated_by ? ' · ' + U.esc(r.updated_by) : '') + '</p>'
      : '<p class="muted small">الترتيب لا يُكتب في هذا النموذج: الصفّ الجديد يأخذ ' +
        '<span class="mono">sort = 100</span> من إعداد الجدول، ثم تُرتّبه بأسهم التقديم ' +
        'والتأخير في القائمة.</p>';

    return U.head(isEdit ? 'تعديل شريك' : 'شريك جديد',
      isEdit ? 'تحديث صفّ موجود في جدول الشركاء' : 'إضافة صفّ جديد إلى جدول الشركاء') +
      reachNotice() + '<div id="partnerlist-err"></div>' + meta +
      U.card(isEdit ? 'بيانات الشريك' : 'بيانات الشريك الجديد', g1 + g2, foot) +
      U.card('رفع شعار إلى المستودع', up) +
      logoNotice();
  }

  function renderForm(mount) {
    if (editId == null) {
      mount.innerHTML = formHtml(null);
      return Promise.resolve();
    }
    var n = toInt(editId);
    if (n == null) {
      /* نُعيد الحالة إلى القائمة كي لا يتحوّل هذا المخرج بصمت إلى نموذج «شريك جديد» */
      editId = null; mode = 'list';
      mount.innerHTML = U.head('تعديل شريك') +
        U.notice('<b>معرّف غير صالح — أُلغي التحميل حمايةً للبيانات.</b><br>' +
          'عد إلى القائمة واختر الشريك من جديد.') +
        '<div class="right"><button class="btn ghost" data-act="partnerlist-cancel">رجوع إلى القائمة</button></div>';
      return Promise.resolve();
    }
    return A.select(TBL, 'select=*&id=eq.' + n + '&limit=1').then(function (rs) {
      if (!rs || !rs.length) {
        editId = null; mode = 'list';
        mount.innerHTML = U.head('تعديل شريك') + U.notice(
          '<b>لم يُعَد أي صفّ بهذا المعرّف (#' + U.esc(n) + ').</b><br>' +
          'قد يكون السجلّ محذوفًا، أو أن سياسات الحماية لا تسمح لحسابك بقراءته — ' +
          'القراءة الممنوعة ترجع نتيجة فارغة لا رسالة خطأ.') +
          '<div class="right"><button class="btn ghost" data-act="partnerlist-cancel">رجوع إلى القائمة</button></div>';
        return;
      }
      mount.innerHTML = formHtml(rs[0]);
    });
  }

  /* تنقّل داخليّ — نُعلم دالة الرسم أن الطلب منّا لا من الشريط الجانبي */
  function goSelf() { internal = true; IAQ.go(KEY); }
  /* الرجوع إلى القائمة يُعيد القراءة من القاعدة، فما يُعرض بعد كل إجراء مقروء
     من الجدول لا محسوب في المتصفّح */
  function backToList() { mode = 'list'; editId = null; goSelf(); }

  /* ------------------------------- التسجيل ------------------------------- */

  IAQ.views.register(KEY, {
    label: 'قائمة الشركاء',
    group: 'الموقع',
    icon: IC_LIST,
    render: function (mount) {
      /* الدخول من الشريط الجانبي يعيدنا دائمًا إلى القائمة، لا إلى نموذج قديم */
      var self = internal; internal = false;
      if (mode === 'form' && !self) { mode = 'list'; editId = null; }
      return mode === 'form' ? renderForm(mount) : renderList(mount);
    }
  });

  /* ------------------------------- التنقّل ------------------------------- */

  IAQ.on('partnerlist-strip', function () { IAQ.go('partners'); });
  IAQ.on('partnerlist-reload', function () { mode = 'list'; editId = null; goSelf(); });
  IAQ.on('partnerlist-new', function () { mode = 'form'; editId = null; goSelf(); });
  IAQ.on('partnerlist-edit', function (btn) {
    mode = 'form'; editId = btn.getAttribute('data-id'); goSelf();
  });
  IAQ.on('partnerlist-cancel', function () { backToList(); });

  /* -------------------------------- الحفظ -------------------------------- */

  function saveBoom(e) {
    if (e && e.status === 409) {
      inlineErr('اسم الشريك مستخدم في صفّ آخر.',
        'على العمود name فهرس فريد في قاعدة البيانات، فرُفض الحفظ ولم يتغيّر شيء. ' +
        'غيّر الاسم، أو عد إلى القائمة وعدّل الصفّ الموجود.');
      U.toast('اسم مكرّر — لم يُحفظ شيء', 'err');
      return;
    }
    boom(e);
  }

  IAQ.on('partnerlist-save', function (btn) {
    /* نفرّق بين «لا يوجد معرّف» (إضافة) و«معرّف موجود لكنه غير صالح» (نتوقّف)،
       فبلا هذا التفريق يتحوّل التعديل إلى إضافة صفّ مكرّر بصمت. */
    var id = btn.getAttribute('data-id');
    var n = null;
    if (id != null && id !== '') {
      n = toInt(id);
      if (n == null) { U.toast('معرّف غير صالح — أُلغي الحفظ.', 'err'); return; }
    }

    var name = trimmed('#partnerlist-name');
    if (!name) {
      inlineErr('اسم الشريك مطلوب.',
        'اكتب اسم الشريك كما يظهر في تلميح الشعار على الموقع ثم أعد الحفظ. ' +
        'لم يُكتب شيء في قاعدة البيانات.');
      U.toast('اسم الشريك مطلوب', 'warn');
      return;
    }
    var st = val('#partnerlist-status');
    if (!statusOk(st)) {
      inlineErr('حالة غير معروفة.',
        'القيم المسموحة في القاعدة ثلاث فقط: published و draft و hidden. ' +
        'أعد اختيار الحالة — لم يُحفظ شيء.');
      U.toast('حالة غير معروفة — أُلغي الحفظ', 'err');
      return;
    }
    /* الطبقة الحيّة تضع قيمة url في خاصية href على الصفحة الرئيسة، فلا نمرّر
       مخطّطًا آخر (مثل javascript:) إلى صفحة يراها الزائر. */
    var link = trimmed('#partnerlist-url');
    if (link && !/^https?:\/\//i.test(link)) {
      inlineErr('رابط الشريك غير مقبول.',
        'يجب أن يبدأ بـ https:// أو http://، أو يُترك فارغًا. ' +
        'هذه القيمة تُوضع كما هي في وصلة الشعار على الصفحة الرئيسة، ' +
        'فلا نقبل غير هذين المخطّطين. لم يُكتب شيء في قاعدة البيانات.');
      U.toast('رابط الشريك يجب أن يبدأ بـ https:// أو http://', 'err');
      return;
    }
    inlineErr('', '');                       // نمحو خطأ محاولة سابقة

    /* logo و url من نوع text not null default '' — نُرسل نصًّا فارغًا لا null */
    var rec = {
      name: name,
      logo: trimmed('#partnerlist-logo'),
      url: link,
      status: st,
      updated_by: who()
    };
    var live = (st === 'published');

    if (n != null) {
      /* updated_at يضعه مُطلِق partners_touch — لا نرسله كي لا نكتب وقتًا من المتصفّح */
      A.update(TBL, n, rec).then(function (rs) {
        if (!rs || !rs.length) {
          U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك أو من وجود السجلّ.', 'warn');
          return;
        }
        return IAQ.audit('partners.update', TBL, n).then(function () {
          U.toast(live
            ? 'حُفظت التعديلات — وتظهر في شريط الصفحة الرئيسة عند أوّل تحميل لها'
            : 'حُفظت التعديلات — والصفّ غير منشور فلا يراه الزائر');
          backToList();
        });
      }).catch(saveBoom);
      return;
    }

    A.insert(TBL, rec, '*').then(function (rs) {
      var nid = rs && rs.length ? rs[0].id : null;
      if (nid == null) {
        /* لا نعرف إن نجحت الإضافة: نُبقي النموذج ونحذّر من تكرار الحفظ */
        U.toast('لم يُعَد صفّ جديد — راجع القائمة قبل إعادة الحفظ كي لا يتكرّر الشريك.', 'warn');
        return;
      }
      return IAQ.audit('partners.create', TBL, nid).then(function () {
        U.toast(live
          ? 'أُضيف الشريك — ويظهر في شريط الصفحة الرئيسة عند أوّل تحميل لها'
          : 'أُضيف الشريك — وحالته غير منشورة فلا يراه الزائر');
        backToList();
      });
    }).catch(saveBoom);
  });

  /* ------------------------------ النشر والإخفاء ------------------------------ */

  IAQ.on('partnerlist-toggle', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    var to = btn.getAttribute('data-arg') === 'published' ? 'published' : 'hidden';
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    A.update(TBL, n, { status: to, updated_by: who() }).then(function (rs) {
      if (!rs || !rs.length) {
        U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك.', 'warn');
        return;
      }
      return IAQ.audit(to === 'published' ? 'partners.publish' : 'partners.hide', TBL, n)
        .then(function () {
          U.toast(to === 'published'
            ? 'صار الصفّ منشورًا — ويظهر في شريط الصفحة الرئيسة عند أوّل تحميل لها'
            : 'أُخفي الصفّ — ويغيب عن الشريط عند أوّل تحميل، وإن لم يبقَ منشورٌ واحد عاد ' +
              'الشريط إلى محتوى الملف الثابت');
          backToList();
        });
    }).catch(boom);
  });

  /* -------------------------------- الترتيب --------------------------------
     الترتيب في الشريط الحيّ وفي هذه الشاشة واحد: order by sort asc, id asc.
     ولذلك تبديل قيمتَي جارين لا يكون صحيحًا إلا إذا كانت كل القيم المُحمَّلة
     موجودة ومتمايزة؛ فمع أي تساوٍ:
       • التبديل الحرفيّ بين متساويين لا يغيّر شيئًا،
       • وكتابة «قيمة الجار ± ١» تقفز بالبطاقة فوق كل الصفوف المتساوية معها
         (بل فوق جار مختلف القيمة أيضًا)، وتُنشئ قيمًا مكرّرة تُفسد ما بعدها.
     فالحلّ: إن كانت القيم متمايزة بدّلنا قيمتين فقط؛ وإلا سألنا المدير ثم
     أعدنا ترقيم الصفوف المُحمَّلة بقيم متمايزة بخطوة STEP وفق الترتيب المطلوب.
     كل الكتابات متسلسلة (كتابة واحدة في كل مرّة) فلا تتسابق، وإن انقطعت
     أخبرنا بعدد ما كُتب فعلًا لا بعدد مُفترَض. ونقرأ الصفوف من القاعدة قبل
     الحساب كي لا نحسب على نسخة قديمة عدّلها مديرٌ آخر. */

  /* كتابة الخطّة صفًّا صفًّا — الوعد يُرجع عدد الصفوف التي كُتبت فعلًا */
  function writeSeq(plan, w, k, ok) {
    if (k >= plan.length) return Promise.resolve(ok);
    var it = plan[k];
    return A.update(TBL, it.id, { sort: it.sort, updated_by: w }).then(function (rs) {
      if (!rs || !rs.length) {
        throw new Error(stopMsg(ok, plan.length, it) +
          ' لم يُحدَّث ذلك الصفّ — تحقّق من صلاحية الكتابة، ثم أعد القراءة من القاعدة.');
      }
      return writeSeq(plan, w, k + 1, ok + 1);
    }, function (e) {
      /* حتى الخطأ القادم من الخدمة يُنسب إلى موضعه: كم صفًّا كُتب قبله وأين توقّف */
      var err = new Error(stopMsg(ok, plan.length, it) + ' ' + msg(e));
      if (e && e.status) err.status = e.status;
      throw err;
    });
  }
  function stopMsg(ok, total, it) {
    return (ok ? ('كُتب ' + F.num(ok) + ' من ' + F.num(total) + ' صفًّا')
               : 'لم يُكتب أي صفّ') +
      ' ثم توقّف الترتيب عند «' + F.cut(it.name || ('#' + it.id), 24) + '».';
  }

  function applyPlan(plan, anchorId, w) {
    var total = plan.length;
    return writeSeq(plan, w, 0, 0).then(function (done) {
      IAQ.audit('partners.reorder', TBL, anchorId);
      U.toast('تغيّر الترتيب في القاعدة (' + F.num(done) + ' من ' + F.num(total) +
        ' صفًّا كُتبت) — ويظهر بترتيبه الجديد في شريط الصفحة الرئيسة عند أوّل تحميل لها');
      backToList();
    }, function (e) {
      /* فشل جزئيّ: نُعيد القراءة كي يرى المدير ما استقرّ فعلًا، ثم نُظهر الخطأ */
      backToList();
      throw e;
    });
  }

  IAQ.on('partnerlist-move', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var dir = btn.getAttribute('data-arg') === 'up' ? -1 : 1;
    var w = who();

    A.select(TBL, 'select=id,name,sort&order=sort.asc,id.asc&limit=' + LIM).then(function (rs) {
      var list = rs || [];
      var i = idxIn(list, n);
      if (i < 0) {
        U.toast('هذا الصفّ لم يعد في الصفوف المقروءة — أعد القراءة من القاعدة.', 'warn');
        return null;
      }
      var j = i + dir;
      if (j < 0 || j >= list.length) {
        U.toast(dir < 0 ? 'البطاقة في أوّل القائمة المقروءة' : 'البطاقة في آخر القائمة المقروءة', 'warn');
        return null;
      }
      var a = list[i], b = list[j], k, plan = [];

      if (allDistinct(list)) {
        plan.push({ id: a.id, name: nameOf(a), sort: sortOf(b) });
        plan.push({ id: b.id, name: nameOf(b), sort: sortOf(a) });
        return applyPlan(plan, a.id, w);
      }

      /* الترتيب المطلوب: نفس القائمة وقد تبادل الصفّان موضعيهما */
      var ord = list.slice(0);
      ord[i] = b; ord[j] = a;

      /* نمشي على الترتيب المطلوب فنجعل القيم متزايدة تمامًا، محتفظين بكل قيمة
         تصلح كما هي — فلا نكتب إلا أقلّ عدد ممكن من الصفوف. والقيم المتزايدة
         تمامًا تجعل الترتيب صريحًا في العمود بلا اعتماد على فكّ التشابه بالمعرّف. */
      var prev = null, v;
      for (k = 0; k < ord.length; k++) {
        v = sortOf(ord[k]);
        if (v == null || (prev != null && v <= prev)) {
          v = (prev == null) ? STEP : prev + 1;
          plan.push({ id: ord[k].id, name: nameOf(ord[k]), sort: v });
        }
        prev = v;
      }
      if (!plan.length) {
        U.toast('لا شيء يُكتب — ترتيب القاعدة مطابق للمطلوب أصلًا.', 'warn');
        return null;
      }
      /* كتابة صفّين أو أقلّ تمضي مباشرة؛ وما زاد على ذلك يُسأل عنه أوّلًا كي لا
         يُفاجَأ المدير بكتابة في صفوف لم يلمسها */
      if (plan.length <= 2) return applyPlan(plan, a.id, w);
      return U.ask('قيم الترتيب في هذه القائمة متساوية أو ناقصة، فتحريك بطاقة واحدة يقتضي ' +
        'كتابة قيمة ترتيب جديدة في ' + F.num(plan.length) + ' صفًّا من ' + F.num(list.length) +
        ' صفًّا مقروءًا، واحدًا تلو الآخر، حتى تصير القيم متمايزة ويصير الترتيب صريحًا. ' +
        'هذا يغيّر العمود sort في تلك الصفوف ولا يمسّ بياناتها الأخرى. أتابع؟',
        'اكتب الترتيب').then(function (okAsk) {
        if (!okAsk) return null;
        return applyPlan(plan, a.id, w);
      });
    }).catch(boom);
  });

  /* --------------------------------- الحذف --------------------------------- */

  IAQ.on('partnerlist-del', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var i = idxIn(rows, n);
    var nm = i >= 0 ? nameOf(rows[i]) : '';

    U.ask('سيُحذف الشريك ' + (nm ? '«' + F.cut(nm, 40) + '» ' : '') +
      'من قاعدة البيانات نهائيًا، ويغيب عن شريط الصفحة الرئيسة عند أوّل تحميل لها. ' +
      'أمّا صورة الشعار في المستودع — إن كانت مرفوعة هنا — فلا تُحذف معه وتبقى في ' +
      'مكتبة الوسائط. هل تريد المتابعة؟', 'حذف').then(function (ok) {
      if (!ok) return null;
      return A.remove(TBL, n).then(function (rs) {
        if (!rs || !rs.length) {
          U.toast('لم يُحذف أي صفّ — قد لا تملك صلاحية الحذف أو السجلّ غير موجود.', 'warn');
          return;
        }
        return IAQ.audit('partners.delete', TBL, n).then(function () {
          U.toast('حُذف الصفّ من القاعدة — ويغيب عن الشريط عند أوّل تحميل للصفحة الرئيسة، ' +
            'وإن لم يبقَ شريك منشور عاد الشريط إلى محتوى الملف الثابت');
          backToList();
        });
      });
    }).catch(boom);
  });

  /* ------------------------------ رفع الشعار ------------------------------
     لا معاملة (transaction) بين المستودع وقاعدة البيانات: نرفع أوّلًا، وإن فشل
     إدخال صفّ الوسائط أعدنا المستودع كما كان وقلنا بدقّة ما حدث. */
  function startUpload(input) {
    var f = (input.files && input.files.length) ? input.files[0] : null;
    if (!f) return;
    if (busy) {
      U.toast('هناك رفع جارٍ — انتظر انتهاءه ثم اختر الملف من جديد', 'warn');
      try { input.value = ''; } catch (eb) { }
      return;
    }

    var ext = extOf(f);
    if (!ext) {
      setUp('<span class="muted small">صيغة غير مدعومة — لم يُرفع شيء.</span>');
      U.toast('صيغة الصورة غير مدعومة. المسموح: png, jpg, webp, gif, svg, avif', 'err');
      try { input.value = ''; } catch (e0) { }
      return;
    }

    var path = 'partners/' + Date.now() + '-' + asciiSlug(f.name) + '.' + ext;
    busy = true;

    function done() {
      busy = false;
      try { input.value = ''; } catch (e1) { }   // كي يُطلق اختيار الملف نفسه الحدث مرّة أخرى
    }

    setUp('<span class="small">جارٍ رفع ' + U.esc(F.cut(String(f.name || ''), 40)) + ' …</span>' +
      '<span class="muted small">' + U.esc(F.bytes(f.size)) + '</span>');

    IAQ.storage.upload(BUCKET, path, f).then(function () {
      return A.insert('media', {
        bucket: BUCKET, storage_path: path, kind: 'image',
        title: String(f.name || path), alt: null, bytes: f.size
      }, '*').catch(function (err) {
        return IAQ.storage.remove(BUCKET, [path]).then(
          function (del) {
            throw new Error('رُفع الشعار لكن فشل حفظ سجلّه في جدول الوسائط (' + msg(err) + '). ' +
              ((del && del.length)
                ? 'وحُذف الملف المرفوع من المستودع، فلم يبقَ شيء معلّق.'
                : 'ولم يُحذف أي ملف من المستودع — تحقّق من المسار: ' + path));
          },
          function (e2) {
            throw new Error('رُفع الشعار وفشل حفظ سجلّه (' + msg(err) +
              ')، وتعذّر أيضًا حذف الملف المرفوع (' + msg(e2) + '). المسار: ' + path);
          }
        );
      });
    }).then(function (mrows) {
      if (!mrows || !mrows.length) {
        throw new Error('رُفع الشعار لكن القاعدة لم تُرجع صفّ وسائط، فلا يمكن تأكيد حفظ سجلّه. ' +
          'مسار الملف في المستودع: ' + path);
      }
      IAQ.audit('media.create', 'media', mrows[0].id);
      var url = IAQ.storage.publicUrl(BUCKET, path);
      var fld = U.$('#partnerlist-logo');
      if (!fld) {
        /* غادر المدير النموذج قبل انتهاء الرفع — لا نُخفي الرابط عنه */
        setUp('');
        U.toast('رُفع الشعار لكن حقل الشعار لم يعد معروضًا. الرابط: ' + url, 'warn');
        done();
        return;
      }
      fld.value = url;
      paintPrev(url);
      setUp('<span class="small">رُفع الشعار ووُضع رابطه الكامل في حقل الشعار.</span>' +
        '<span class="mono">' + U.esc(F.cut(url, 48)) + '</span>');
      U.toast('رُفع الشعار — اضغط الحفظ لتثبيت الرابط في صفّ الشريك');
      done();
    }).catch(function (e) {
      setUp('<span class="muted small">تعذّر الرفع — لم يتغيّر حقل الشعار.</span>');
      U.toast(msg(e), 'err');
      done();
    });
  }

  /* مستمع واحد على المستند: الشاشة تُعاد بالكامل، فلا نربط شيئًا بعنصر نرسمه */
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.tagName || String(t.tagName).toLowerCase() !== 'input') return;
    if (t.type !== 'file' || t.id !== 'partnerlist-file') return;
    startUpload(t);
  });

})();
