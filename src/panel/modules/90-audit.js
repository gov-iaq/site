/* ============================================================================
   سجلّ العمليات — شاشة قراءة فقط لجدول public.audit_log.

   قرارات مقصودة في هذه الشاشة:
   • لا يوجد أي زرّ حذف أو تعديل هنا. سجلّ عمليات يمكن محوه من شاشته لا قيمة له،
     والنصّ المعروض للمستخدم يقول ذلك صراحةً.
   • لا نكتب في السجلّ عند فتحه (لا IAQ.audit) — قراءة السجلّ ليست عملية تُسجَّل،
     وإلّا تلوّث السجلّ بنفسه.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة لا خطأ، فلا نزعم وجود خطأ عند
     الفراغ؛ نقول إن السجلّ قد يكون فارغًا فعلًا أو أن الدور لا يسمح بقراءته.
   • تُقرأ آخر 200 سطر فقط، والتصفية والبحث يعملان على هذه الصفوف داخل المتصفّح
     لا على كامل الجدول — وهذا مكتوب في الواجهة كي لا يُفهم العدد خطأً.
   • أزرار التصفية تُبنى من قيم entity الموجودة فعلًا في الصفوف المقروءة، لا من
     قائمة ثابتة، فلا تظهر تصنيفات وهمية.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var KEY = 'audit';
  var LIMIT = 200;

  /* حالة الشاشة — تُقرأ عند كلّ إعادة رسم، والرسم يستبدل محتوى المنطقة كاملًا
     لذلك لا نُعلّق أيّ مستمع على عنصر ننشئه، بل نستخدم data-act. */
  var mountEl = null;   // منطقة العرض
  var rows = [];        // الصفوف المقروءة فعلًا — لا تُختلق أبدًا
  var total = null;     // الإجمالي من ترويسة Content-Range، أو null إن تعذّر
  var ent = '*';        // الكيان المُصفّى: '*' = الكل، '' = سطور بلا كيان
  var q = '';           // نصّ البحث الحالي
  var loadErr = '';     // رسالة فشل القراءة إن وقعت

  /* ----------------------------- أيقونات الأسطر ----------------------------- */
  var ICON = {
    create: '<path d="M12 5v14M5 12h14"/>',
    update: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    del: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
    publish: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18"/>',
    unpub: '<path d="M3 3l18 18"/><path d="M10.6 5.2A9 9 0 0 1 21 12a9 9 0 0 1-1.5 5M4.5 7A9 9 0 0 0 3 12a9 9 0 0 0 10.4 6.8"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    logout: '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    other: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>'
  };

  /* صيغة المفعول به في الجملة العربية */
  var ENT_ACC = {
    news: 'خبرًا',
    documents: 'وثيقة',
    submissions: 'طلبًا واردًا',
    survey_responses: 'استجابة استبيان',
    settings: 'إعدادًا',
    content_overrides: 'تعديل محتوى',
    media: 'ملف وسائط',
    admins: 'حسابًا إداريًا',
    audit_log: 'سطر سجلّ'
  };
  /* اسم الكيان في أزرار التصفية */
  var ENT_NAME = {
    news: 'الأخبار',
    documents: 'الوثائق',
    submissions: 'الطلبات الواردة',
    survey_responses: 'الاستبيانات',
    settings: 'الإعدادات',
    content_overrides: 'تعديلات المحتوى',
    media: 'الوسائط',
    admins: 'المدراء',
    audit_log: 'سجلّ العمليات'
  };
  /* قراءة آمنة من قواميس هذا الملف: قيم قادمة من قاعدة البيانات تُستخدم كمفاتيح،
     وبدون hasOwnProperty قد ترجع خصائص Object الموروثة (constructor / toString /
     __proto__) فيُطبع نصّ دالّة داخلية في الواجهة بدل الترجمة العربية. */
  function dict(map, k) {
    return Object.prototype.hasOwnProperty.call(map, String(k)) ? map[String(k)] : null;
  }

  var VERB = {
    create: 'أضاف',
    update: 'حدّث',
    del: 'حذف',
    publish: 'نشر',
    unpub: 'أوقف نشر',
    login: 'سجّل الدخول إلى اللوحة',
    logout: 'خرج من اللوحة',
    upload: 'رفع ملفًا'
  };

  /* تصنيف الإجراء من نصّه — الترتيب مهم: unpublish قبل publish، وlogout قبل login */
  function kindOf(a) {
    var s = String(a == null ? '' : a).toLowerCase();
    if (s.indexOf('logout') >= 0 || s.indexOf('signout') >= 0) return 'logout';
    if (s.indexOf('login') >= 0 || s.indexOf('signin') >= 0) return 'login';
    if (s.indexOf('unpublish') >= 0) return 'unpub';
    if (s.indexOf('publish') >= 0) return 'publish';
    if (s.indexOf('upload') >= 0) return 'upload';
    if (s.indexOf('delete') >= 0 || s.indexOf('remove') >= 0) return 'del';
    if (s.indexOf('update') >= 0 || s.indexOf('upsert') >= 0 ||
        s.indexOf('edit') >= 0 || s.indexOf('patch') >= 0) return 'update';
    if (s.indexOf('create') >= 0 || s.indexOf('insert') >= 0 || s.indexOf('add') >= 0) return 'create';
    return 'other';
  }

  function svgOf(kind) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (dict(ICON, kind) || ICON.other) + '</svg>';
  }

  function entOf(r) { return r.entity == null ? '' : String(r.entity); }

  /* جملة عربية مفهومة + الإجراء الخام كما هو في الجدول (شفافية، لا تفسير مُخترع) */
  function sentence(r) {
    var kind = kindOf(r.action);
    var e = entOf(r);
    var raw = String(r.action == null ? '' : r.action);
    var actor = '<b>' + U.esc(r.actor_email || 'حساب غير معروف') + '</b>';
    var obj = e ? (U.esc(dict(ENT_ACC, e) || ('سجلًّا في «' + e + '»'))) : '';
    var idPart = '';
    if (r.entity_id != null && String(r.entity_id) !== '') {
      idPart = ' رقم <span class="mono">' + U.esc(String(r.entity_id)) + '</span>';
    }

    var txt;
    if (kind === 'login' || kind === 'logout') {
      txt = actor + ' ' + (dict(VERB, kind) || '');
    } else if (kind === 'other') {
      txt = actor + ' نفّذ الإجراء <span class="mono">' + U.esc(raw) + '</span>' +
            (obj ? ' على ' + obj : '') + idPart;
      return txt;                       // لا نُكرّر الإجراء الخام مرّتين
    } else {
      txt = actor + ' ' + (dict(VERB, kind) || 'نفّذ إجراءً على') + ' ' +
            (obj || 'سجلًّا غير محدّد الجدول') + idPart;
    }
    if (raw) txt += ' <span class="mono">· ' + U.esc(raw) + '</span>';
    return txt;
  }

  /* ------------------------- الكيانات الموجودة فعلًا ------------------------- */
  /* البادئة '#' مقصودة: قيمة entity قادمة من قاعدة البيانات، ومفتاح مثل '__proto__'
     لا يُخزَّن كخصيصة عادية فيُكرَّر الزرّ ويصبح العدّ NaN. */
  function entList() {
    var seen = {}, order = [], i, v, k;
    for (i = 0; i < rows.length; i++) {
      v = entOf(rows[i]);
      k = '#' + v;
      if (!Object.prototype.hasOwnProperty.call(seen, k)) { seen[k] = 0; order.push(v); }
      seen[k]++;
    }
    order.sort();
    return order.map(function (x) { return { v: x, n: seen['#' + x] }; });
  }

  /* عدد الجداول الحقيقية في الصفوف المقروءة — السطور بلا كيان ليست جدولًا فلا تُحتسب */
  function entRealCount() {
    var l = entList(), c = 0, i;
    for (i = 0; i < l.length; i++) if (l[i].v) c++;
    return c;
  }

  function readQ() {
    var el = U.$('#audit-q');
    return el ? String(el.value == null ? '' : el.value).replace(/^\s+|\s+$/g, '') : q;
  }

  /* تصفية داخل المتصفّح على الصفوف المقروءة فقط */
  function apply() {
    var needle = q.toLowerCase();
    return rows.filter(function (r) {
      if (ent !== '*' && entOf(r) !== ent) return false;
      if (!needle) return true;
      var hay = (String(r.actor_email == null ? '' : r.actor_email) + ' ' +
                 String(r.action == null ? '' : r.action)).toLowerCase();
      return hay.indexOf(needle) >= 0;
    });
  }

  /* -------------------------------- الرسم -------------------------------- */
  function noteHtml() {
    return U.notice(
      '<b>ما يرصده هذا السجلّ وما لا يرصده.</b><br>' +
      'يُدوّن هذا الجدول ما تفعله لوحة التحكّم نفسها فقط: إضافة وتعديل وحذف الصفوف ورفع الملفات ' +
      'من هذه اللوحة. أيّ تغيير يجري من خارجها — مباشرة في Supabase، أو عند إعادة بناء الموقع ' +
      'من ملفات المصدر — لا يظهر هنا.<br>' +
      'والتدوين يجري بـ«أفضل جهد»: إذا فشلت كتابة السطر لا يُلغى الإجراء نفسه، ولذلك ' +
      '<b>غياب سطر لا يعني أن التغيير لم يحدث</b>، كما أنّ وجود سطر لا يُثبت وحده أن الإجراء اكتمل.<br>' +
      'ولن تجد زرّ حذف في هذه الشاشة، وهذا مقصود: سجلّ عمليات يمكن محوه من شاشته لا قيمة له. ' +
      'إن لزم حذف أو أرشفة فمن Supabase مباشرة وبقرار مُوثَّق خارج اللوحة.'
    );
  }

  function metricsHtml(shown) {
    var h = '<div class="metric-grid">';
    h += total == null
      ? '<div class="metric warn"><div class="mv">—</div><div class="ml">الإجمالي في الجدول (تعذّر قراءته)</div></div>'
      : '<div class="metric"><div class="mv">' + F.num(total) + '</div><div class="ml">إجمالي السطور في الجدول</div></div>';
    h += '<div class="metric"><div class="mv">' + F.num(rows.length) + '</div><div class="ml">المقروء في هذه الصفحة</div></div>';
    h += '<div class="metric"><div class="mv">' + F.num(shown) + '</div><div class="ml">المطابق للتصفية الحالية</div></div>';
    h += '<div class="metric"><div class="mv">' + F.num(entRealCount()) + '</div><div class="ml">الجداول الظاهرة في الصفوف المقروءة</div></div>';
    h += '</div>';
    return h;
  }

  function filterbarHtml() {
    var list = entList();
    var h = '<div class="filterbar">' +
      '<button class="btn sm' + (ent === '*' ? ' ok' : ' ghost') + '" data-act="auditFilter" data-arg="*">' +
      'الكل (' + F.num(rows.length) + ')</button>';
    list.forEach(function (it) {
      var label = it.v ? U.esc(dict(ENT_NAME, it.v) || it.v) : 'بلا كيان';
      h += '<button class="btn sm' + (ent === it.v ? ' ok' : ' ghost') + '" data-act="auditFilter" ' +
        'data-arg="' + U.esc(it.v) + '">' + label + ' (' + F.num(it.n) + ')</button>';
    });
    return h + '</div>';
  }

  function searchHtml() {
    return '<div class="fld"><label for="audit-q">بحث في البريد الإلكتروني أو اسم الإجراء</label>' +
      '<div class="addrow">' +
      '<input id="audit-q" type="text" value="' + U.esc(q) + '" placeholder="مثال: update أو name@example.com" />' +
      '<button class="btn sm" data-act="auditSearch">تصفية</button>' +
      '<button class="btn sm ghost" data-act="auditClear">مسح التصفية</button>' +
      '</div></div>' +
      '<div class="small muted">اكتب الكلمة ثم اضغط «تصفية». البحث يجري داخل المتصفّح على الصفوف ' +
      'المقروءة أعلاه فقط (' + F.num(rows.length) + ' سطرًا)، لا على كامل الجدول.</div>';
  }

  function timelineHtml(list) {
    return '<div class="timeline">' + list.map(function (r) {
      return '<div class="tl-item">' +
        '<div class="tl-ic">' + svgOf(kindOf(r.action)) + '</div>' +
        '<div><div class="tl-txt">' + sentence(r) + '</div>' +
        '<div class="tl-date">' + U.esc(F.date(r.created_at)) + '</div></div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function paint() {
    if (!mountEl) return;
    /* لا نقول «أحدث 200 عملية» لأن الجدول قد يحوي أقلّ من ذلك — 200 حدّ أعلى للقراءة لا عدد مؤكَّد */
    var h = U.head('سجلّ العمليات',
      'أحدث العمليات المُسجَّلة من لوحة التحكّم، الأحدث أولًا، بحدّ أعلى ' + F.num(LIMIT) + ' سطرًا.');
    h += noteHtml();

    if (loadErr) {
      h += U.notice('<b>تعذّرت قراءة سجلّ العمليات.</b><br>' + U.esc(loadErr) +
        '<br>لم يُعرض أيّ سطر، ولا نعرف عدد السطور الموجودة فعلًا.');
      h += U.card('', '<div class="right"><button class="btn ghost sm" data-act="auditReload">إعادة المحاولة</button></div>');
      mountEl.innerHTML = h;
      return;
    }

    var list = apply();
    h += metricsHtml(list.length);

    if (total != null && total > rows.length) {
      h += '<div class="small muted" style="margin-block-end:14px">في الجدول ' + F.num(total) +
        ' سطرًا، والمعروض هنا أحدث ' + F.num(rows.length) + ' سطرًا فقط.</div>';
    }

    h += filterbarHtml();

    var body = searchHtml();
    if (!rows.length) {
      body += U.empty('لا توجد بيانات') +
        '<div class="small muted" style="text-align:center">' +
        'قد يكون السجلّ فارغًا فعلًا، وقد لا تسمح سياسات قاعدة البيانات لدورك بقراءته — ' +
        'القراءة الممنوعة ترجع نتيجة فارغة لا رسالة خطأ، فلا نستطيع التمييز بينهما من هنا.</div>';
    } else if (!list.length) {
      body += U.empty('لا يوجد سطر مطابق للتصفية أو البحث الحالي');
    } else {
      body += timelineHtml(list);
    }

    h += U.card('العمليات المُسجَّلة', body,
      '<button class="btn ghost sm" data-act="auditReload">تحديث من قاعدة البيانات</button>');

    mountEl.innerHTML = h;
  }

  /* -------------------------------- القراءة -------------------------------- */

  /* منطقة العرض (#viewArea) واحدة لكل الشاشات: لو غادر المستخدم هذه الشاشة قبل وصول
     البيانات فالرسم سيمحو شاشة غيرها. وعند تعذّر معرفة الشاشة الحالية نرسم كالمعتاد. */
  function gone() {
    var k = String(location.hash || '').replace('#', '');
    return k !== '' && k !== KEY;
  }

  function load() {
    loadErr = '';
    if (mountEl) mountEl.innerHTML = U.spinner('جارٍ قراءة سجلّ العمليات…');
    /* id.desc ثانويًّا: عدّة سطور قد تحمل الطابع الزمني نفسه، وبدون مفتاح ثانٍ
       يصبح ترتيب أوّل 200 سطر غير مستقرّ بين قراءة وأخرى. */
    return A.select('audit_log',
      'select=id,actor_email,action,entity,entity_id,created_at&order=created_at.desc,id.desc&limit=' + LIMIT)
      .then(function (list) {
        rows = list || [];
        /* الإجمالي منفصل: فشله لا يُفشل الشاشة، ونقول إنه غير متاح بدل تلفيق رقم */
        return A.count('audit_log', 'select=id').then(
          function (n) { return n; },
          function () { return null; }
        );
      })
      .then(function (n) {
        /* النواة تُرجع 0 إذا غابت ترويسة Content-Range أو تعذّر تحليلها. صفر مع وجود
           صفوف مقروءة يعني ترويسة غير موثوقة، فنقول «تعذّر قراءته» ولا نعرض رقمًا كاذبًا. */
        total = (n == null || !isFinite(n) || n < rows.length) ? null : Number(n);
        if (gone()) return;
        paint();
      })
      .catch(function (e) {
        rows = []; total = null;
        loadErr = (e && e.message) || 'فشل الإجراء';
        if (gone()) return;
        U.toast(loadErr, 'err');
        paint();
      });
  }

  IAQ.views.register(KEY, {
    label: 'سجلّ العمليات',
    group: 'عام',
    icon: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>' +
          '<rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
    render: function (mount) {
      mountEl = mount;
      ent = '*';
      q = '';
      return load();
    }
  });

  /* الأحداث بالتفويض — نقرأ نصّ البحث قبل كلّ إعادة رسم كي لا يضيع ما كُتب */
  IAQ.on('auditFilter', function (btn) {
    q = readQ();
    ent = btn.getAttribute('data-arg');
    if (ent == null) ent = '*';
    paint();
  });

  IAQ.on('auditSearch', function () {
    q = readQ();
    paint();
  });

  IAQ.on('auditClear', function () {
    q = '';
    ent = '*';
    paint();
  });

  IAQ.on('auditReload', function () {
    load();
  });
})();
