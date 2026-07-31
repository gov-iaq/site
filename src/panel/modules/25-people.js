/* ============================================================================
   وحدة الأعضاء والفريق — إدارة كاملة لجدول public.people بمجموعاته الثلاث:
   الجمعية العمومية (assembly) ومجلس الإدارة (board) وفريق العمل (team).

   حقائق تحقّقتُ منها من مصدر الموقع نفسه قبل كتابة أي نصّ في الواجهة
   (قرأتُ src/templates/iaq-lists.js و src/build.py، ولم أنقل ادّعاءً عن أحد):
   • البناء الثابت هو الأساس: أقسام الأشخاص الثلاثة تُبنى وقت التوليد في
     src/build.py (render_members / render_board / render_team) من الملفات
     src/data/assembly-members.json و board-members.json و team-members.json.
   • وفوقه طبقة القوائم الحيّة src/templates/iaq-lists.js — تُحقن في سكربت
     التشغيل لكل صفحة عبر runtime_script() — تقرأ عند تحميل الصفحة:
       people?select=…&grp=eq.<المجموعة>&status=eq.published&order=sort.asc,id.asc
     ثم تستنسخ بطاقة القسم وتُعبّئها من الصفوف (clone-and-fill) وتستبدل البطاقات.
     الوظائف مربوطة بمُعرِّف الصفحة (slug): assembly ← assembly.html،
     board ← board.html، team ← team.html. فالتغيير هنا يبلغ الزائر عند أوّل
     تحميل للصفحة بلا إعادة بناء — وهذا مُصرَّح به في الواجهة كما هو، بلا تهويل.
   • حدّان حقيقيّان يقولهما التنبيه أيضًا، لأنهما نتيجة مباشرة لأفعال هذه الشاشة:
     ‏(١) if (!rows || !rows.length) return; — نتيجة فارغة (إخفاء الكلّ أو حذفه
     أو سقوط الشبكة أو منع RLS) تُبقي البطاقات المبنيّة من ملفات JSON كما هي،
     فلا يمكن تفريغ قسم من هنا؛ (٢) في مجلس الإدارة تُستبدل .bd-lead و.bd-grid
     كلٌّ على حدة بشرط lead.length / rest.length، فغياب رتبة chair أو vice من
     القاعدة يُبقي بطاقات الصدارة المبنيّة على حالها.
   • الصور: الطبقة تضع 'img/' + kind + '/' + row.photo بلا أي تحقّق، وتستعير
     قالب الأيقونة الرمزية (bd-sym/tm-sym) حين يكون الحقل فارغًا فقط — تمامًا
     كما يفعل البنّاء. فاسم يشير إلى ملف مفقود يُنتج <img> مكسورًا لا أيقونة،
     والواجهة تقول ذلك بدقّة بدل تعميم «تظهر الأيقونة البديلة».
     ولا يوجد للأشخاص في مجلّد صور الموقع سوى img/board و img/team — الجمعية
     العمومية تُعرض بحرف أوّل الاسم لا بصورة، فحقل الصورة مخفيّ عنها.
   • rank ليس زينة: البنّاء والطبقة الحيّة كلاهما يضع chair و vice في الصدارة
     ويُنزل الباقي إلى الشبكة — فتعديل الرتبة يُغيّر موضع البطاقة عند الزائر.

   ملاحظات مثبَّتة تخصّ الجدول (من supabase/schema-v3.sql):
   • rank ليس نصًّا حرًّا: قيد CHECK يقبل chair|vice|lead|member فقط، ولا يقبل ''.
     لذلك عند الإضافة لمجموعة لا تُحرّر الرتبة نُرسل 'member' صريحًا، وعند
     التعديل لا نُرسل rank إطلاقًا كي تبقى القيمة المخزَّنة (فريق العمل فيه
     رتبة lead فعلًا، وإرسال 'member' كان سيمحوها بصمت).
   • status قيده CHECK: draft|published|hidden. أمّا cat فبلا قيد، وقيمته
     الافتراضية '' — لذلك نُبقي خيارًا صريحًا للقيمة الفارغة عند التعديل.
   • فهرس فريد على (grp, name): اسم مكرّر داخل المجموعة نفسها يرجع 409.
   • مُطلِق people_touch يضبط updated_at عند كل UPDATE — فلا نرسله من هنا،
     ونرسل updated_by وحده. وكل الأعمدة النصّية تُرسل نصًّا فارغًا لا null.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة لا خطأ — فلا نُسمّي غياب
     الصفوف خطأً، ولا نعرض صفرًا لم نقرأه.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;
  var KEY = 'people';

  /* المجموعات الثلاث وما تستخدمه من الأعمدة فعليًّا */
  var GROUPS = [
    { id: 'assembly', name: 'الجمعية العمومية', one: 'عضو في الجمعية العمومية',
      role: false, rank: false, cat: true,  photo: false, contact: false },
    { id: 'board',    name: 'مجلس الإدارة',      one: 'عضو في مجلس الإدارة',
      role: true,  rank: true,  cat: false, photo: true,  contact: false },
    { id: 'team',     name: 'فريق العمل',        one: 'عضو في فريق العمل',
      role: true,  rank: false, cat: false, photo: true,  contact: true }
  ];

  var RANKS = [
    { v: 'chair',  t: 'رئيس المجلس' },
    { v: 'vice',   t: 'نائب الرئيس' },
    { v: 'lead',   t: 'مدير تنفيذي' },
    { v: 'member', t: 'عضو' }
  ];
  var CATS = [
    { v: 'founder', t: 'عضو مؤسس' },
    { v: 'working', t: 'عضو عامل' }
  ];
  var STATUS = [
    { v: 'published', t: 'ظاهر' },
    { v: 'hidden',    t: 'مخفي' },
    { v: 'draft',     t: 'مسودّة' }
  ];

  /* حالة الشاشة — تُقرأ عند كل رسم لأن الشاشة تُعاد بالكامل */
  var grp = 'assembly';     // المجموعة المعروضة: تنقّل الشاشة الأساسي
  var mode = 'list';        // 'list' أو 'form'
  var editId = null;        // معرّف العضو عند التعديل، أو null للإضافة
  var internal = false;     // هل جاء الرسم من تنقّل داخليّ لهذه الوحدة؟

  /* عدد كل مجموعة كما تقرؤه القاعدة. null = لم يُقرأ — لا يُعرض صفرًا مكانه */
  var counts = { assembly: null, board: null, team: null };

  var IC_EDIT = '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>';
  var IC_UP = '<path d="M12 16V6"/><path d="M8 10l4-4 4 4"/><path d="M5 19h14"/>';
  var IC_DOWN = '<path d="M12 6v10"/><path d="M8 12l4 4 4-4"/><path d="M5 19h14"/>';
  var IC_DEL = '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>';
  var IC_EYE = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>';
  var IC_EYEOFF = '<path d="M4 4l16 16"/>' +
    '<path d="M9.8 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.5 17.5 0 0 1-2.7 3.3"/>' +
    '<path d="M6.4 7.5A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4-.8"/>';

  /* --------------------------- أدوات مساعدة صغيرة --------------------------- */

  /* معرّف صحيح موجب أو null — نتحقّق قبل بناء أي استعلام يحمل معرّفًا */
  function toInt(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) return null;
    return n;
  }

  function gOf(id) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i];
    return null;
  }
  function labelOf(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i].t;
    return '';
  }

  function val(sel) {
    var el = U.$(sel);
    return el ? String(el.value == null ? '' : el.value) : '';
  }
  function trimmed(sel) { return val(sel).replace(/^\s+|\s+$/g, ''); }
  function txt(v) { return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }
  function who() { return (IAQ.me && IAQ.me.email) || ''; }

  function statusBadge(s) {
    var cls = s === 'published' ? 'rp' : (s === 'hidden' ? 'cl' : 'nw');
    var t = labelOf(STATUS, s);
    return '<span class="stbadge ' + cls + '">' + U.esc(t || (s || '—')) + '</span>';
  }

  function boom(e) { U.toast((e && e.message) || 'فشل الإجراء', 'err'); }

  /* لاحقة رسالة الحفظ تتبع الحالة المحفوظة فعلًا: صفحات الموقع تقرأ «ظاهر» وحدها،
     فقول «يراه الزائر» عن مسودّة أو صفٍّ مخفيّ كذب صريح. */
  function reachMsg(st) {
    if (st === 'published') return ' — يراه الزائر في أوّل تحميل للصفحة';
    return ' — حالته «' + (labelOf(STATUS, st) || st) + '» ولا تقرؤها صفحات الموقع، فلا يظهر للزائر';
  }

  /* التنبيه الإلزاميّ عن المدى — مقروء من طبقة القوائم الحيّة نفسها */
  function reachNotice() {
    return U.notice(
      '<b>ما تحفظه هنا يصل إلى الموقع فعلًا، وبلا إعادة بناء.</b><br>' +
      'طبقة القوائم الحيّة (<span class="mono">src/templates/iaq-lists.js</span>) المحقونة في صفحات ' +
      'الموقع تقرأ هذا الجدول عند تحميل الصفحة وتُعيد بناء البطاقات منه: ' +
      '<span class="mono">assembly.html</span> للجمعية العمومية، و<span class="mono">board.html</span> ' +
      'لمجلس الإدارة، و<span class="mono">team.html</span> لفريق العمل. ' +
      'فالإضافة والتعديل والإظهار والإخفاء والحذف وإعادة الترتيب يراها الزائر في أوّل تحميل للصفحة ' +
      'بعد الحفظ — بلا إعادة بناء ولا نشر. تقرأ الطبقة الصفوف ذات الحالة «ظاهر» وحدها، ' +
      'مرتّبةً بـ<span class="mono">sort</span> ثم بالمعرّف كما في هذه الشاشة — إلا في مجلس ' +
      'الإدارة، فرتبتا «رئيس المجلس» و«نائب الرئيس» تُنقلان إلى بطاقات الصدارة أوّلًا ثم يأتي ' +
      'الباقون بهذا الترتيب، أي أنّ ترتيب جدول المجلس هنا ليس هو ترتيب البطاقات عند الزائر حرفيًّا. ' +
      'وصفحة مفتوحة أمام الزائر الآن لا تتبدّل من نفسها، لأنّ القراءة تحدث عند التحميل فقط.' +
      '<br><b>وحدّان لا نُخفيهما:</b> ' +
      '(١) إن لم تُعِد القاعدة أي صفّ «ظاهر» — أخفيتَ الكلّ أو حذفتَه، أو سقطت الشبكة، أو منعت ' +
      'سياسات الحماية القراءة — فالطبقة تُبقي البطاقات المبنيّة من ملفات ' +
      '<span class="mono">src/data/*-members.json</span> كما هي. أي أنّك لا تستطيع تفريغ قسم من هذه ' +
      'الشاشة: الزائر سيرى القائمة المبنيّة القديمة لا قسمًا فارغًا. ' +
      '(٢) في مجلس الإدارة تُستبدل بطاقات الصدارة (رئيس المجلس ونائبه) وبطاقات الشبكة كلٌّ على حدة، ' +
      'فإن لم يكن في القاعدة صفٌّ برتبة «رئيس المجلس» أو «نائب الرئيس» بقيت بطاقات الصدارة المبنيّة ' +
      'على حالها بجانب بطاقاتك الجديدة.',
      'ok'
    );
  }

  /* نصّ ثابت عن الصور — الوحدة تخزّن الاسم فقط ولا ترفع ملفًا */
  var PHOTO_NOTE =
    'يُخزَّن اسم الملف فقط، وهذه الشاشة لا ترفع صورًا. يجب أن يكون الملف موجودًا مسبقًا في ' +
    '<span class="mono">site/img/board/</span> أو <span class="mono">site/img/team/</span> — ' +
    'طبقة القوائم الحيّة تضع المسار <span class="mono">img/&lt;المجموعة&gt;/&lt;اسم الملف&gt;</span> ' +
    'كما هو بلا أي تحقّق، فاسم يشير إلى ملف مفقود يُنتج صورة مكسورة عند الزائر لا أيقونة بديلة. ' +
    'أمّا الحقل الفارغ فيُظهر الأيقونة الرمزية سليمةً — فاتركه فارغًا إن لم تكن الصورة جاهزة.';

  /* ------------------------------ شاشة القائمة ------------------------------ */

  /* عدّ فعليّ لكل مجموعة. فشل العدّ وحده لا يُسقط الشاشة — يبقى «غير معروف» */
  function loadCounts() {
    var jobs = GROUPS.map(function (g) {
      return A.count('people', 'select=id&grp=eq.' + g.id).then(function (n) {
        counts[g.id] = n;
      }).catch(function () { counts[g.id] = null; });
    });
    return Promise.all(jobs);
  }

  function grpBtn(g) {
    var n = counts[g.id];
    return '<button class="btn sm' + (grp === g.id ? ' ok' : ' ghost') + '" data-act="people-grp" ' +
      'data-arg="' + U.esc(g.id) + '">' + U.esc(g.name) + ' (' +
      (n == null ? '—' : U.esc(F.num(n))) + ')</button>';
  }

  function photoCell(r) {
    var p = txt(r.photo);
    if (!p) return '<span class="muted">—</span>';
    return '<img src="' + U.esc('img/' + r.grp + '/' + p) + '" alt="' + U.esc(r.name) +
      '" width="34" height="34" style="border-radius:8px;object-fit:cover;background:#f3f6f7">';
  }

  function nameCell(g, r) {
    var t = txt(r.title);
    var h = '<b>' + (t ? U.esc(t) + ' ' : '') + U.esc(r.name || '(بلا اسم)') + '</b>';
    if (g.contact) {
      var bits = [];
      if (txt(r.phone)) bits.push(txt(r.phone));
      if (txt(r.email)) bits.push(txt(r.email));
      if (bits.length) {
        h += '<br><span class="mono small">' + U.esc(bits.join(' · ')) + '</span>';
      }
    }
    return h;
  }

  function rowActs(g, r, first, last) {
    var pub = r.status === 'published';
    var h = '<div class="acts">' +
      U.iconBtn('people-edit', IC_EDIT, { id: r.id, sm: true, label: 'تعديل' });
    /* حراسة أولى: لا نرسم زرًّا لا معنى له في طرفَي القائمة */
    if (!first) h += U.iconBtn('people-up', IC_UP, { id: r.id, sm: true, label: 'تحريك لأعلى' });
    if (!last) h += U.iconBtn('people-down', IC_DOWN, { id: r.id, sm: true, label: 'تحريك لأسفل' });
    h += U.iconBtn('people-toggle', pub ? IC_EYEOFF : IC_EYE,
      { id: r.id, arg: pub ? 'hidden' : 'published', sm: true,
        label: pub ? 'إخفاء' : 'إظهار' }) +
      U.iconBtn('people-del', IC_DEL, { id: r.id, sm: true, danger: true, label: 'حذف' }) +
      '</div>';
    return h;
  }

  function renderList(mount) {
    var g = gOf(grp) || GROUPS[0];
    grp = g.id;
    var q = 'select=*&grp=eq.' + g.id + '&order=sort.asc,id.asc';

    return Promise.all([loadCounts(), A.select('people', q)]).then(function (res) {
      var rows = res[1] || [];
      var last = rows.length - 1;

      var bar = '<div class="filterbar">' + GROUPS.map(grpBtn).join('') + '</div>';

      var body;
      if (!rows.length) {
        body = U.empty('لا توجد صفوف في هذه المجموعة، أو أنّ سياسات الحماية لا تسمح لحسابك ' +
          'بقراءتها — القراءة الممنوعة ترجع نتيجة فارغة بلا رسالة خطأ.');
      } else if (g.cat) {
        body = U.table(
          ['الترتيب', 'الاسم', 'التصنيف', 'الحالة', 'إجراءات'],
          rows.map(function (r, i) {
            var c = labelOf(CATS, txt(r.cat));
            return [
              '<span class="mono small">' + U.esc(F.num(r.sort)) + '</span>',
              nameCell(g, r),
              c ? '<span class="chip">' + U.esc(c) + '</span>'
                : (txt(r.cat) ? '<span class="chip">' + U.esc(txt(r.cat)) + '</span>'
                              : '<span class="muted">—</span>'),
              statusBadge(r.status),
              rowActs(g, r, i === 0, i === last)
            ];
          })
        );
      } else {
        body = U.table(
          ['الترتيب', 'الصورة', 'الاسم', 'المنصب', 'الرتبة', 'الحالة', 'إجراءات'],
          rows.map(function (r, i) {
            var rk = labelOf(RANKS, txt(r.rank));
            return [
              '<span class="mono small">' + U.esc(F.num(r.sort)) + '</span>',
              photoCell(r),
              nameCell(g, r),
              txt(r.role) ? U.esc(F.cut(txt(r.role), 46)) : '<span class="muted">—</span>',
              rk ? '<span class="chip">' + U.esc(rk) + '</span>'
                 : (txt(r.rank) ? '<span class="mono small">' + U.esc(txt(r.rank)) + '</span>'
                                : '<span class="muted">—</span>'),
              statusBadge(r.status),
              rowActs(g, r, i === 0, i === last)
            ];
          })
        );
      }

      var foot = '<button class="btn" data-act="people-new">إضافة ' + U.esc(g.one) + '</button>';

      var tail = '<p class="muted small">الأعداد بين قوسَي أزرار المجموعات مقروءة من القاعدة بعدٍّ ' +
        'فعليّ لكل مجموعة، والشرطة تعني «تعذّر العدّ» لا صفرًا. ' +
        'الترتيب المعروض هو العمود <span class="mono">sort</span> تصاعديًّا ثم المعرّف، ' +
        'وهو الترتيب نفسه الذي تحرّكه أسهم الصفوف. وإن كانت قيم ' +
        '<span class="mono">sort</span> في المجموعة متساوية فتحريك صفٍّ واحد يقتضي إعادة ترقيم ' +
        'الصفوف بقيم متمايزة — تُسأل قبل ذلك ولا يُكتب شيء بلا موافقتك.</p>';

      /* لا نُخفي تعارضًا بين العدّ الكلّي وما حُمِّل فعلًا */
      var cn = counts[g.id];
      if (cn != null && cn !== rows.length) {
        tail += U.notice('<b>تنبيه:</b> العدّ الكلّي لهذه المجموعة ' + U.esc(F.num(cn)) +
          ' بينما حُمِّل ' + U.esc(F.num(rows.length)) + ' صفًّا فقط. ' +
          'قد تكون الخدمة تُرقّم النتائج، أو أنّ سياسات الحماية تمنع قراءة بعض الصفوف. ' +
          'ما تراه في الجدول هو ما أعادته القاعدة، لا أكثر.');
      }
      if (g.photo) {
        tail += '<p class="muted small">' + PHOTO_NOTE + '</p>';
      }

      mount.innerHTML =
        U.head('الأعضاء والفريق', 'الجمعية العمومية ومجلس الإدارة وفريق العمل — جدول واحد بثلاث مجموعات') +
        reachNotice() + bar +
        U.card(g.name + ' — الصفوف المُحمَّلة (' + F.num(rows.length) + ')', body, foot) +
        tail;
    });
  }

  /* ------------------------------ شاشة النموذج ------------------------------ */

  /* قائمة اختيار. blankLabel يُستخدم حين تكون القيمة المخزَّنة خارج القائمة،
     كي لا يختار المتصفّح أوّل خيار فيُبدّل بيانات لم يمسّها المدير. */
  function selHtml(id, list, cur, blankLabel) {
    var found = false, i;
    for (i = 0; i < list.length; i++) if (list[i].v === cur) found = true;
    var h = '<select id="' + id + '">';
    if (!found && blankLabel) {
      h += '<option value="" selected>' + U.esc(blankLabel) + '</option>';
    }
    h += list.map(function (o) {
      return '<option value="' + U.esc(o.v) + '"' + (o.v === cur ? ' selected' : '') + '>' +
        U.esc(o.t) + '</option>';
    }).join('');
    return h + '</select>';
  }

  function formHtml(g, r, nextSort) {
    r = r || {};
    var isEdit = !!r.id;

    var h = '<div class="prow" style="margin-block-end:14px">' +
      '<span class="muted">المجموعة:</span><b>' + U.esc(g.name) + '</b>' +
      '<span class="mono small">' + U.esc(g.id) + '</span>' +
      '<span class="muted small">المجموعة مثبَّتة في هذا النموذج؛ نقل شخص من مجموعة إلى أخرى ' +
      'غير متاح من هذه الشاشة.</span></div>';

    h += '<div class="grid2">' +
      '<div class="fld"><label for="people-title">اللقب</label>' +
        '<input type="text" id="people-title" value="' + U.esc(txt(r.title)) +
        '" placeholder="أ. أو م. أو د."><span class="muted small">اختياري، ويُخزَّن نصًّا فارغًا ' +
        'إن تُرك خاليًا.</span></div>' +
      '<div class="fld"><label for="people-name">الاسم</label>' +
        '<input type="text" id="people-name" value="' + U.esc(txt(r.name)) +
        '" placeholder="الاسم الثلاثي"><span class="muted small">مطلوب، وفريد داخل المجموعة — ' +
        'اسم مكرّر في المجموعة نفسها ترفضه القاعدة.</span></div>' +
      '</div>';

    if (g.role) {
      h += '<div class="fld"><label for="people-role">المنصب</label>' +
        '<input type="text" id="people-role" value="' + U.esc(txt(r.role)) +
        '" placeholder="' + (g.id === 'board' ? 'عضو مجلس إدارة' : 'المدير التنفيذي') + '"></div>';
    }

    if (g.rank) {
      h += '<div class="fld"><label for="people-rank">الرتبة</label>' +
        selHtml('people-rank', RANKS, isEdit ? txt(r.rank) : 'member') +
        '<span class="muted small">الرتبة تُرتّب البطاقات في الموقع (الرئيس ونائبه في الصدارة) ' +
        'ولا تقبل القاعدة غير هذه القيم الأربع.</span></div>';
    } else if (isEdit && txt(r.rank)) {
      /* لا نُحرّر الرتبة هنا، ولا نمسحها: نُخبر بها ونحفظها كما هي */
      h += '<p class="muted small">الرتبة المخزَّنة لهذا الصفّ: <b>' +
        U.esc(labelOf(RANKS, txt(r.rank)) || txt(r.rank)) + '</b> — لا تُحرَّر من نموذج ' +
        U.esc(g.name) + '، وتُحفظ كما هي بلا تغيير.</p>';
    }

    if (g.cat) {
      h += '<div class="fld"><label for="people-cat">التصنيف</label>' +
        selHtml('people-cat', CATS, isEdit ? txt(r.cat) : 'working',
          'كما هي في القاعدة (غير محدّدة)') +
        '</div>';
    }

    if (g.contact) {
      h += '<div class="grid2">' +
        '<div class="fld"><label for="people-phone">الهاتف</label>' +
          '<input type="text" id="people-phone" value="' + U.esc(txt(r.phone)) +
          '" placeholder="05XXXXXXXX" dir="ltr"></div>' +
        '<div class="fld"><label for="people-email">البريد</label>' +
          '<input type="text" id="people-email" value="' + U.esc(txt(r.email)) +
          '" placeholder="name@iaq.org.sa" dir="ltr"></div>' +
        '</div>';
    }

    if (g.photo) {
      var p = txt(r.photo);
      h += '<div class="fld"><label for="people-photo">اسم ملف الصورة</label>' +
        '<input type="text" id="people-photo" value="' + U.esc(p) +
        '" placeholder="' + U.esc(g.id) + '-01.jpg" dir="ltr">' +
        '<span class="muted small">' + PHOTO_NOTE + '</span></div>';
      if (p) {
        h += '<div class="prow"><span class="muted small">المخزَّن الآن:</span>' +
          '<img src="' + U.esc('img/' + g.id + '/' + p) + '" alt="' + U.esc(txt(r.name)) +
          '" width="34" height="34" style="border-radius:8px;object-fit:cover;background:#f3f6f7">' +
          '<span class="mono small">' + U.esc('img/' + g.id + '/' + p) + '</span>' +
          '<span class="muted small">إن ظهرت الصورة مكسورة فالملف غير موجود بهذا الاسم.</span></div>';
      }
    }

    var sortVal = isEdit ? String(r.sort == null ? '' : r.sort) : String(nextSort);
    h += '<div class="grid2">' +
      '<div class="fld"><label for="people-sort">الترتيب</label>' +
        '<input type="number" id="people-sort" step="1" value="' + U.esc(sortVal) + '" dir="ltr">' +
        '<span class="muted small">' +
        (isEdit
          ? 'الأصغر يظهر أولًا. أسهم الصفوف في القائمة تبدّل هذه القيمة تلقائيًّا، وإن كانت قيم ' +
            'المجموعة متساوية سألتك أوّلًا قبل إعادة ترقيمها كلّها بقيم متمايزة.'
          : 'القيمة المقترحة = أكبر ترتيب مقروء في هذه المجموعة + 10، أو 10 إن لم تُعِد القاعدة صفًّا.') +
        '</span></div>' +
      '<div class="fld"><label for="people-status">الحالة</label>' +
        selHtml('people-status', STATUS, isEdit ? txt(r.status) : 'published') +
        '<span class="muted small">«ظاهر» هي الحالة الوحيدة التي تقرؤها صفحات الموقع؛ ' +
        'و«مخفي» و«مسودّة» لا تظهران للزائر — مع مراعاة الحدّ الأول في التنبيه أعلى الشاشة.' +
        '</span></div>' +
      '</div>';

    var foot = '<button class="btn ghost" data-act="people-cancel">إلغاء</button>' +
      '<button class="btn" data-act="people-save" data-arg="' + U.esc(g.id) + '"' +
      (isEdit ? ' data-id="' + U.esc(r.id) + '"' : '') + '>' +
      (isEdit ? 'حفظ التعديلات' : 'إضافة إلى ' + U.esc(g.name)) + '</button>';

    var meta = isEdit
      ? '<p class="muted small mono">#' + U.esc(r.id) + ' · أُنشئ: ' + U.esc(F.date(r.created_at)) +
        (r.updated_at ? ' · آخر تعديل: ' + U.esc(F.date(r.updated_at)) : '') +
        (txt(r.updated_by) ? ' · ' + U.esc(txt(r.updated_by)) : '') + '</p>'
      : '';

    return U.head(isEdit ? 'تعديل بيانات شخص' : 'إضافة ' + g.one,
      isEdit ? 'تحديث صفّ موجود في جدول الأشخاص' : 'إضافة صفّ جديد إلى جدول الأشخاص') +
      reachNotice() + meta +
      U.card(isEdit ? 'البيانات' : 'بيانات الصفّ الجديد', h, foot);
  }

  function backCard(title, body) {
    return U.head(title) + U.notice(body) +
      '<div class="right"><button class="btn ghost" data-act="people-cancel">رجوع إلى القائمة</button></div>';
  }

  function renderForm(mount) {
    var g = gOf(grp) || GROUPS[0];

    if (editId == null) {
      /* الترتيب المقترح مقروء من القاعدة لا مُخترع: أكبر sort في المجموعة + 10 */
      return A.select('people', 'select=sort&grp=eq.' + g.id + '&order=sort.desc&limit=1')
        .then(function (rows) {
          var next = 10;
          if (rows && rows.length) {
            var m = Math.round(Number(rows[0].sort));
            if (isFinite(m)) next = m + 10;
          }
          mount.innerHTML = formHtml(g, null, next);
        });
    }

    var n = toInt(editId);
    if (n == null) {
      // نُعيد الحالة إلى القائمة كي لا يتحوّل هذا المخرج بصمت إلى نموذج «إضافة»
      editId = null; mode = 'list';
      mount.innerHTML = backCard('تعديل بيانات شخص',
        '<b>معرّف غير صالح — أُلغي التحميل حمايةً للبيانات.</b><br>' +
        'عد إلى القائمة واختر الصفّ من جديد.');
      return Promise.resolve();
    }

    return A.select('people', 'select=*&id=eq.' + n + '&limit=1').then(function (rows) {
      if (!rows || !rows.length) {
        editId = null; mode = 'list';
        mount.innerHTML = backCard('تعديل بيانات شخص',
          '<b>لم يُعَد أي صفّ بهذا المعرّف (#' + U.esc(n) + ').</b><br>' +
          'قد يكون السجلّ محذوفًا، أو أن سياسات الحماية لا تسمح لحسابك بقراءته — ' +
          'القراءة الممنوعة ترجع نتيجة فارغة لا رسالة خطأ.');
        return;
      }
      var r = rows[0];
      /* مجموعة الصفّ هي المرجع، لا المرشِّح المعروض — كي لا نرسم حقولًا لا تخصّه */
      var rg = gOf(txt(r.grp));
      if (!rg) {
        editId = null; mode = 'list';
        mount.innerHTML = backCard('تعديل بيانات شخص',
          '<b>مجموعة هذا الصفّ غير معروفة:</b> <span class="mono">' + U.esc(txt(r.grp) || 'فارغة') +
          '</span><br>هذه الشاشة تعرف ثلاث مجموعات فقط (assembly, board, team)، ' +
          'ولن تحرّر صفًّا خارجها كي لا تُتلف بياناته.');
        return;
      }
      grp = rg.id;
      mount.innerHTML = formHtml(rg, r, 0);
    });
  }

  /* -------------------------- قراءة النموذج وحفظه -------------------------- */

  /* لا نرسل null لأي عمود نصّي، ولا نرسل updated_at (مُطلِق people_touch يضبطه) */
  function collect(g) {
    var name = trimmed('#people-name');
    if (!name) { U.toast('الاسم مطلوب', 'warn'); return null; }

    var sortRaw = trimmed('#people-sort');
    var sortN = Math.round(Number(sortRaw));
    if (sortRaw === '' || !isFinite(sortN)) {
      U.toast('الترتيب مطلوب ويجب أن يكون عددًا صحيحًا', 'warn');
      return null;
    }

    /* حقل مفقود = لا نعرف ما يريده المدير. الاستبدال الصامت بقيمة افتراضية
       يمحو حالةً منشورةً أو رتبةً مخزَّنةً بلا أن يرى أحد، فنتوقّف بدلًا من ذلك. */
    var stEl = U.$('#people-status');
    if (!stEl) {
      U.toast('حقل الحالة غير موجود في الشاشة — أُلغي الحفظ كي لا تتبدّل الحالة بصمت.', 'err');
      return null;
    }
    var st = String(stEl.value == null ? '' : stEl.value);
    if (!labelOf(STATUS, st)) {   // قيد CHECK لا يقبل غير draft|published|hidden
      U.toast('حالة غير معروفة — أُلغي الحفظ.', 'err');
      return null;
    }

    var rec = {
      title: trimmed('#people-title'),
      name: name,
      sort: sortN,
      status: st,
      updated_by: who()
    };

    if (g.role) rec.role = trimmed('#people-role');
    if (g.rank) {
      var rkEl = U.$('#people-rank');
      if (!rkEl) {
        U.toast('حقل الرتبة غير موجود في الشاشة — أُلغي الحفظ كي لا تُمحى الرتبة المخزَّنة.', 'err');
        return null;
      }
      var rk = String(rkEl.value == null ? '' : rkEl.value);
      if (!labelOf(RANKS, rk)) {   // قيد CHECK لا يقبل غير chair|vice|lead|member
        U.toast('رتبة غير معروفة — أُلغي الحفظ.', 'err');
        return null;
      }
      rec.rank = rk;
    }
    if (g.cat) {
      var ctEl = U.$('#people-cat');
      if (!ctEl) {
        U.toast('حقل التصنيف غير موجود في الشاشة — أُلغي الحفظ كي لا يُمحى التصنيف المخزَّن.', 'err');
        return null;
      }
      var ct = String(ctEl.value == null ? '' : ctEl.value);
      rec.cat = labelOf(CATS, ct) ? ct : '';      // '' مقبولة في cat (بلا قيد CHECK)
    }
    if (g.contact) {
      rec.phone = trimmed('#people-phone');
      rec.email = trimmed('#people-email');
    }
    if (g.photo) rec.photo = trimmed('#people-photo');

    return rec;
  }

  /* تنقّل داخليّ — نُعلم دالة الرسم أن الطلب منّا لا من الشريط الجانبي */
  function goSelf() { internal = true; IAQ.go(KEY); }

  function backToList() { mode = 'list'; editId = null; goSelf(); }

  /* ------------------------------- التسجيل ------------------------------- */

  IAQ.views.register(KEY, {
    label: 'الأعضاء والفريق',
    group: 'المحتوى',
    icon: '<circle cx="9.2" cy="8" r="3.3"/>' +
          '<path d="M3.4 19.2c0-3.3 2.6-5.6 5.8-5.6s5.8 2.3 5.8 5.6"/>' +
          '<path d="M16.2 5.4a3.3 3.3 0 0 1 0 6.4"/>' +
          '<path d="M17.6 13.9c1.9.6 3 2.2 3 4.3"/>',
    render: function (mount) {
      // الدخول من الشريط الجانبي يعيدنا دائمًا إلى القائمة، لا إلى نموذج قديم
      var self = internal; internal = false;
      if (mode === 'form' && !self) { mode = 'list'; editId = null; }
      return mode === 'form' ? renderForm(mount) : renderList(mount);
    }
  });

  /* ------------------------------- الإجراءات ------------------------------- */

  IAQ.on('people-grp', function (btn) {
    var g = gOf(btn.getAttribute('data-arg'));
    if (!g) { U.toast('مجموعة غير معروفة', 'err'); return; }
    grp = g.id; mode = 'list'; editId = null;
    goSelf();
  });

  IAQ.on('people-new', function () {
    mode = 'form'; editId = null; goSelf();
  });

  IAQ.on('people-edit', function (btn) {
    mode = 'form'; editId = btn.getAttribute('data-id'); goSelf();
  });

  IAQ.on('people-cancel', function () { backToList(); });

  IAQ.on('people-save', function (btn) {
    var g = gOf(btn.getAttribute('data-arg'));
    if (!g) { U.toast('مجموعة غير معروفة — أُلغي الحفظ.', 'err'); return; }

    // نفرّق بين «لا يوجد معرّف» (إضافة) و«معرّف موجود لكنه غير صالح» (نتوقّف).
    // بلا هذا التفريق يتحوّل التعديل إلى إضافة صفّ مكرّر بصمت.
    var id = btn.getAttribute('data-id');
    var n = null;
    if (id != null && id !== '') {
      n = toInt(id);
      if (n == null) { U.toast('معرّف غير صالح — أُلغي الحفظ.', 'err'); return; }
    }

    var rec = collect(g);
    if (!rec) return;

    if (n != null) {
      A.update('people', n, rec).then(function (rows) {
        if (!rows || !rows.length) {
          U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك أو من وجود السجلّ.', 'warn');
          return;
        }
        return IAQ.audit('people.update', 'people', n).then(function () {
          U.toast('تم الحفظ' + reachMsg(rec.status));
          backToList();
        });
      }).catch(boom);
      return;
    }

    rec.grp = g.id;
    // قيد CHECK على rank لا يقبل '' — والمجموعات التي لا تحرّر الرتبة تأخذ 'member'
    if (!rec.rank) rec.rank = 'member';

    A.insert('people', rec, '*').then(function (rows) {
      var nid = rows && rows.length ? rows[0].id : null;
      if (nid == null) {
        // لا نعرف إن نجحت الإضافة: نُبقي النموذج ونحذّر من تكرار الحفظ
        U.toast('لم يُعَد سجلّ جديد — راجع القائمة قبل إعادة الحفظ كي لا يتكرّر الصفّ.', 'warn');
        return;
      }
      return IAQ.audit('people.create', 'people', nid).then(function () {
        U.toast('أُضيف الصفّ' + reachMsg(rec.status));
        backToList();
      });
    }).catch(boom);
  });

  IAQ.on('people-toggle', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var to = btn.getAttribute('data-arg') === 'published' ? 'published' : 'hidden';
    A.update('people', n, { status: to, updated_by: who() }).then(function (rows) {
      if (!rows || !rows.length) {
        U.toast('لم يُحدَّث أي صفّ — تحقّق من صلاحياتك.', 'warn');
        return;
      }
      return IAQ.audit('people.update', 'people', n).then(function () {
        // الإخفاء لا يعني الغياب دائمًا: مجموعة بلا صفٍّ «ظاهر» تُبقي البطاقات
        // المبنيّة من ملفات JSON كما هي (الحدّ الأول في تنبيه الشاشة).
        U.toast(to === 'published'
          ? 'صار الصفّ ظاهرًا — يراه الزائر في أوّل تحميل للصفحة'
          : 'أُخفي الصفّ في القاعدة — يغيب عن الزائر في أوّل تحميل ما لم تخلُ المجموعة من ' +
            'الصفوف «الظاهرة» (انظر الحدّين في تنبيه الشاشة)');
        IAQ.go(KEY);
      });
    }).catch(boom);
  });

  /* -------------------------------- الترتيب --------------------------------
     الترتيب هنا وعند الزائر واحد: order by sort asc, id asc. ولذلك تبديل
     قيمتَي جارَين لا يصحّ إلا إذا كانت كل القيم المقروءة متمايزة؛ فمع أي تساوٍ:
       • التبديل الحرفيّ بين متساويين لا يغيّر شيئًا (المعرّف هو الذي يحسم)،
       • وكتابة «قيمة الجار ± ١» تُقفز الصفّ فوق كل الصفوف المتساوية معه لا
         خطوةً واحدة، وقد تُنشئ قيمة مكرّرة جديدة مع الجار الأبعد فتُفسد ما بعدها.
     والتساوي ليس نادرًا: عمود sort افتراضه 100، فكل صفٍّ يُدخَل من خارج هذه
     الشاشة بلا قيمة صريحة يقع في التساوي نفسه.
     فالحلّ: إن كانت القيم متمايزة بدّلنا قيمتين فقط؛ وإلا سألنا المدير ثم
     أعدنا ترقيم الصفوف المقروءة بقيم متمايزة بخطوة STEP وفق الترتيب المطلوب.
     كل الكتابات متسلسلة (كتابة واحدة في كل مرّة) فلا تتسابق، وإن انقطعت
     أخبرنا بعدد ما كُتب فعلًا لا بعدد مُفترَض. ونقرأ من القاعدة قبل الحساب كي
     لا نحسب على نسخة قديمة عدّلها مديرٌ آخر. */

  var STEP = 10;

  /* قيمة ترتيب رقمية أو null. العمود not null default 100، لكن لا نفترض ذلك عند القراءة */
  function sortOf(r) {
    if (r == null || r.sort == null || r.sort === '') return null;
    var n = Number(r.sort);
    return isFinite(n) ? n : null;
  }
  function allDistinct(list) {
    var seen = {}, i, v;
    for (i = 0; i < list.length; i++) {
      v = sortOf(list[i]);
      if (v == null) return false;
      if (seen['v' + v]) return false;
      seen['v' + v] = true;
    }
    return true;
  }
  function nameOf(r) { return txt(r && r.name) || ('#' + (r && r.id)); }

  /* كتابة الخطّة صفًّا صفًّا — الوعد يُرجع عدد الصفوف التي كُتبت فعلًا */
  function writeSeq(plan, w, k, ok) {
    if (k >= plan.length) return Promise.resolve(ok);
    var it = plan[k];
    return A.update('people', it.id, { sort: it.sort, updated_by: w }).then(function (rs) {
      if (!rs || !rs.length) {
        throw new Error('كُتب ' + F.num(ok) + ' من ' + F.num(plan.length) + ' صفًّا ثم توقّف ' +
          'الترتيب عند «' + F.cut(it.name, 24) + '» — لم يُحدَّث ذلك الصفّ، تحقّق من صلاحية ' +
          'الكتابة ثم راجع القائمة المقروءة من القاعدة.');
      }
      return writeSeq(plan, w, k + 1, ok + 1);
    });
  }

  function applyPlan(plan, anchorId, w) {
    var total = plan.length;
    return writeSeq(plan, w, 0, 0).then(function (done) {
      IAQ.audit('people.reorder', 'people', anchorId);
      U.toast('تغيّر الترتيب في القاعدة (' + F.num(done) + ' من ' + F.num(total) +
        ' صفًّا كُتبت) — ويظهر بترتيبه الجديد للزائر عند أوّل تحميل للصفحة');
      mode = 'list'; editId = null;
      IAQ.go(KEY);
    }, function (e) {
      /* فشل جزئيّ: نُعيد القراءة كي يرى المدير ما استقرّ فعلًا، ثم نُظهر الخطأ */
      mode = 'list'; editId = null;
      IAQ.go(KEY);
      throw e;
    });
  }

  function move(id, dir) {
    var n = toInt(id);
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    var g = gOf(grp) || GROUPS[0];
    var w = who();

    A.select('people', 'select=id,sort,name&grp=eq.' + g.id + '&order=sort.asc,id.asc')
      .then(function (rows) {
        rows = rows || [];
        var i = -1, k;
        for (k = 0; k < rows.length; k++) {
          if (Number(rows[k].id) === n) { i = k; break; }
        }
        if (i < 0) {
          U.toast('لم يُعَد هذا الصفّ في هذه المجموعة — حدّث الشاشة ثم أعد المحاولة.', 'warn');
          return null;
        }
        var j = i + dir;
        /* حراسة ثانية عند التنفيذ: الشاشة قد تكون رُسمت قبل تغيير غيرك */
        if (j < 0) { U.toast('هذا الصفّ في أوّل القائمة المقروءة', 'warn'); return null; }
        if (j >= rows.length) { U.toast('هذا الصفّ في آخر القائمة المقروءة', 'warn'); return null; }

        var a = rows[i], b = rows[j], plan = [];

        /* القيم متمايزة: تبديل قيمتين يكفي، وكتابتان متسلسلتان لا متوازيتان */
        if (allDistinct(rows)) {
          plan.push({ id: a.id, name: nameOf(a), sort: sortOf(b) });
          plan.push({ id: b.id, name: nameOf(b), sort: sortOf(a) });
          return applyPlan(plan, a.id, w);
        }

        /* الترتيب المطلوب: نفس القائمة وقد تبادل الصفّان موضعيهما */
        var ord = rows.slice(0);
        ord[i] = b; ord[j] = a;
        for (k = 0; k < ord.length; k++) {
          if (sortOf(ord[k]) !== STEP * (k + 1)) {
            plan.push({ id: ord[k].id, name: nameOf(ord[k]), sort: STEP * (k + 1) });
          }
        }
        if (!plan.length) {
          U.toast('لا شيء يُكتب — ترتيب القاعدة مطابق للمطلوب أصلًا.', 'warn');
          return null;
        }
        return U.ask('قيم الترتيب في هذه المجموعة متساوية أو ناقصة، فتحريك صفٍّ واحد يقتضي ' +
          'إعادة ترقيم ' + F.num(plan.length) + ' صفًّا من ' + F.num(rows.length) +
          ' صفًّا مقروءًا، بقيم متمايزة بخطوة ' + F.num(STEP) + '، كتابةً بعد كتابة. ' +
          'هذا يغيّر عمود sort في تلك الصفوف ولا يمسّ بياناتها الأخرى. أتابع؟',
          'أعد الترقيم').then(function (okAsk) {
          if (!okAsk) return null;
          return applyPlan(plan, a.id, w);
        });
      }).catch(boom);
  }

  IAQ.on('people-up', function (btn) { move(btn.getAttribute('data-id'), -1); });
  IAQ.on('people-down', function (btn) { move(btn.getAttribute('data-id'), 1); });

  IAQ.on('people-del', function (btn) {
    var n = toInt(btn.getAttribute('data-id'));
    if (n == null) { U.toast('معرّف غير صالح', 'err'); return; }
    U.ask('سيُحذف هذا الشخص من قاعدة البيانات نهائيًا. هل تريد المتابعة؟', 'حذف')
      .then(function (ok) {
        if (!ok) return;
        return A.remove('people', n).then(function (rows) {
          if (!rows || !rows.length) {
            U.toast('لم يُحذف أي صفّ — قد لا تملك صلاحية الحذف أو السجلّ غير موجود.', 'warn');
            return;
          }
          return IAQ.audit('people.delete', 'people', n).then(function () {
            U.toast('حُذف الصفّ من القاعدة — يتحدّث القسم عند أوّل تحميل ما لم تخلُ المجموعة من ' +
              'الصفوف «الظاهرة» (انظر الحدّين في تنبيه الشاشة)');
            mode = 'list'; editId = null;
            IAQ.go(KEY);
          });
        });
      }).catch(boom);
  });

})();
