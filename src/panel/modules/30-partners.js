/* ============================================================================
   شريط الشركاء — نمط حركة شريط الشعارات في الصفحة الرئيسة، وسرعة دورته.

   الحالة المخزَّنة صفّان فقط في جدول settings:
     partners_strip_mode   : "auto" | "manual" | "fade"
     partners_strip_speed  : عدد ثوانٍ (الافتراضي 34)
   العمود value من نوع jsonb، فالقيمة تصل مُفكَّكة أصلًا (نصّ أو عدد) وتُرسل خامًا.

   حقائق تحقّقتُ منها من مصدر الموقع نفسه — الواجهة تقولها كما هي بلا مبالغة:
   • طبقة التشغيل في الصفحات تقرأ settings?is_public=is.true وتطبّق
     partners_strip_mode فعليًّا وقت العرض — بلا إعادة بناء.
   • هذه الإعدادات تُخزَّن في متصفّح الزائر مدّة خمس دقائق، فقد يرى زائر عائد
     النمط السابق للحظة ثم يُصحَّح تلقائيًّا عند أوّل تحديث للإعدادات.
   • partners_strip_speed لا تقرؤه صفحات الموقع بعد: مدّة الدورة مثبَّتة على
     34 ثانية في تنسيقات البناء (‎--mq-speed‎). نقولها صريحةً بدل الإيهام.
   • الشريط موجود في قسم الشركاء بالصفحة الرئيسة فقط، لا في كل الصفحات.
   • الشعارات نفسها تُبنى من src/data/partners.json وقت التوليد — غير قابلة
     للتعديل من هنا بعد.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var K_MODE = 'partners_strip_mode';
  var K_SPEED = 'partners_strip_speed';
  /* الوصفان مطابقان لما زُرع في مخطّط قاعدة البيانات كي لا يُستبدل بنصّ آخر */
  var L_MODE = 'نمط حركة شريط الشركاء: auto متصل | manual يدوي | fade تلاشي';
  var L_SPEED = 'مدّة دورة الشريط المتصل بالثواني (أكبر = أبطأ)';

  var DEF_SPEED = 34, MIN_SPEED = 18, MAX_SPEED = 70;
  var CSS_SPEED = 34;                 // القيمة المثبَّتة فعلًا في تنسيقات البناء

  var MODES = [
    { id: 'auto',   name: 'شريط متصل',      desc: 'تدفّق دائري لا ينقطع، يتوقّف عند مرور المؤشّر' },
    { id: 'manual', name: 'تحريك يدوي',     desc: 'يسحبه الزائر بإصبعه أو بالأسهم، بلا حركة تلقائية' },
    { id: 'fade',   name: 'تبديل بالتلاشي', desc: 'مجموعات تتبدّل بهدوء كل أربع ثوانٍ تقريبًا' }
  ];

  function modeById(id) {
    for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
    return null;
  }
  function clamp(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return DEF_SPEED;
    if (n < MIN_SPEED) return MIN_SPEED;
    if (n > MAX_SPEED) return MAX_SPEED;
    return n;
  }

  /* المقروء من القاعدة (db) مقابل اختيار المدير قبل الحفظ (sel) */
  var db = { any: false, mode: null, speed: null, at: null, by: '' };
  var sel = { mode: null, speed: DEF_SPEED };

  /* ------------------------------ قراءة الحالة ------------------------------ */
  function load() {
    return A.select('settings',
      'select=key,value,updated_at,updated_by&key=in.(' + K_MODE + ',' + K_SPEED + ')'
    ).then(function (rows) {
      db = { any: false, mode: null, speed: null, at: null, by: '' };
      (rows || []).forEach(function (r) {
        if (r.key === K_MODE) {
          db.any = true;
          db.mode = (r.value === null || r.value === undefined) ? null : String(r.value);
          db.at = r.updated_at || null;
          db.by = r.updated_by || '';
        } else if (r.key === K_SPEED) {
          db.any = true;
          var n = Number(r.value);
          db.speed = isFinite(n) ? n : null;
        }
      });
      /* المزامنة عند كل دخول للشاشة: ما نعرضه مبدئيًّا هو المخزَّن لا التخمين */
      sel.mode = modeById(db.mode) ? db.mode : null;
      sel.speed = db.speed == null ? DEF_SPEED : clamp(db.speed);
    });
  }

  function isDirty() {
    if (!db.any) return true;
    if (sel.mode !== db.mode) return true;
    if (db.speed == null) return true;
    return clamp(db.speed) !== clamp(sel.speed);
  }
  function dirtyText() {
    if (!db.any) return 'لا شيء محفوظ في قاعدة البيانات بعد';
    return isDirty() ? 'تغييرات لم تُحفظ' : 'كل التغييرات محفوظة';
  }

  /* -------------------------------- الرسم -------------------------------- */
  function optCard(m) {
    var picked = sel.mode === m.id;
    var live = db.any && db.mode === m.id;
    return '<div class="stat-box' + (picked ? ' accent' : '') + '" data-act="partnersPick" data-arg="' +
      U.esc(m.id) + '" role="button" tabindex="0" aria-pressed="' + (picked ? 'true' : 'false') +
      '" style="cursor:pointer">' +
      '<div class="sb-top"><div class="sb-val" style="font-size:1.12rem">' + U.esc(m.name) + '</div>' +
      (live ? '<span class="chip">مُطبَّق الآن</span>' : '') + '</div>' +
      '<div class="sb-label" style="margin-top:6px;line-height:1.75">' + U.esc(m.desc) + '</div>' +
      '<div class="mono small" style="margin-top:8px">' + U.esc(m.id) + '</div></div>';
  }

  function markup() {
    var h = U.head('شريط الشركاء', 'طريقة حركة شريط شعارات الشركاء في قسم «شركاء النجاح» بالصفحة الرئيسة');

    if (!db.any) {
      h += U.notice('<b>لم تُقرأ أي قيمة مخزَّنة لشريط الشركاء.</b><br>' +
        'إمّا أنّ الصفّين غير موجودين في جدول <span class="mono">settings</span>، أو أنّ سياسات الحماية ' +
        'لا تسمح لحسابك بقراءتهما — القراءة الممنوعة ترجع فارغة بلا خطأ، فلا نستطيع التمييز بينهما. ' +
        'الصفحات في هذه الحالة تعمل بالنمط الابتدائي المبنيّ من ' +
        '<span class="mono">partners.json → strip_mode</span> (وهو «شريط متصل» ما لم يُغيَّر). ' +
        'الحفظ من هنا سيُنشئ الصفّين إن كانت لديك صلاحية الكتابة.');
    } else if (db.mode && !modeById(db.mode)) {
      h += U.notice('<b>القيمة المخزَّنة غير معروفة:</b> <span class="mono">' + U.esc(db.mode) + '</span> — ' +
        'صفحات الموقع تتجاهلها وتعود إلى «شريط متصل». اختر نمطًا صحيحًا واحفظ لتصحيح الصفّ.');
    }

    /* ما يحدث فعلًا عند الحفظ — لا وعد بأكثر من ذلك */
    h += U.notice('<b>ما يحدث عند الحفظ:</b> النمط يُخزَّن في جدول الإعدادات، وصفحات الموقع تقرؤه ' +
      'مباشرةً من قاعدة البيانات عند العرض، فلا يحتاج إعادة بناء أو نشر. ' +
      'الصفحة تحتفظ بنسخة محليّة من الإعدادات مدّة خمس دقائق، فيصل التغيير إلى الزائر ' +
      'خلال خمس دقائق كحدّ أقصى — أو فورًا بتحديث قسري (Ctrl+Shift+R).', 'ok');

    var live = db.any && modeById(db.mode) ? modeById(db.mode) : null;
    var meta = '<div class="prow"><span class="muted">النمط المخزَّن الآن:</span>' +
      '<b>' + U.esc(live ? live.name : 'غير محدّد') + '</b>' +
      (db.at ? '<span class="muted small">آخر تحديث ' + U.esc(F.date(db.at)) +
        (db.by ? ' — ' + U.esc(db.by) : '') + '</span>' : '') + '</div>';

    h += U.card('اختر نمط الحركة',
      '<div class="qa-grid">' + MODES.map(optCard).join('') + '</div>' + meta);

    h += U.card('سرعة الشريط المتصل',
      '<div class="fld"><label for="partners-speed">مدّة الدورة الكاملة بالثواني ' +
      '(' + U.esc(String(MIN_SPEED)) + '–' + U.esc(String(MAX_SPEED)) + ')</label>' +
      '<input type="range" id="partners-speed" min="' + MIN_SPEED + '" max="' + MAX_SPEED +
      '" step="2" value="' + clamp(sel.speed) + '"></div>' +
      '<div class="prow"><b class="mono" id="partners-speed-val">' + clamp(sel.speed) + ' ث</b>' +
      '<span class="muted small">القيمة الأكبر = حركة أبطأ. تخصّ نمط «شريط متصل» وحده، ' +
      'ولا أثر لها في «تحريك يدوي» أو «تبديل بالتلاشي».</span></div>' +
      U.notice('<b>بصراحة:</b> هذه القيمة تُحفظ في قاعدة البيانات، لكنّ صفحات الموقع ' +
        '<u>لا تقرؤها بعد</u>: مدّة الدورة مثبَّتة على ' + U.esc(String(CSS_SPEED)) + ' ثانية داخل تنسيقات ' +
        'البناء (<span class="mono">--mq-speed</span>). حفظها اليوم لا يغيّر سرعة الشريط عند الزائر، ' +
        'وستعمل حين تُربط الصفحات بها. أمّا النمط أعلاه فيُطبَّق فعليًّا.'));

    h += '<div class="btnbar"><span class="muted small" id="partners-dirty" style="margin-inline-end:auto">' +
      U.esc(dirtyText()) + '</span>' +
      '<button class="btn ghost" data-act="partnersReload">إعادة القراءة من القاعدة</button>' +
      '<button class="btn ghost" data-act="partnersUndo">تراجع</button>' +
      '<button class="btn ok" data-act="partnersSave">حفظ الإعداد</button></div>';

    h += U.card('شعارات الشركاء',
      '<p class="muted" style="line-height:1.9">أسماء الشركاء وشعاراتهم وروابطهم تُبنى من الملف ' +
      '<span class="mono">src/data/partners.json</span> عند توليد الموقع، والصور في ' +
      '<span class="mono">site/img/partners/</span>. لا يمكن إضافة شريك أو حذفه أو تبديل شعاره من هذه ' +
      'اللوحة بعد — يُعدَّل الملف ثم يُعاد البناء والنشر. هذه الشاشة تتحكّم في طريقة الحركة فقط.</p>');

    return h;
  }

  function repaint() {
    var m = U.$('#viewArea');
    if (!m) return;
    m.innerHTML = markup();
  }

  /* ------------------------------- التسجيل ------------------------------- */
  IAQ.views.register('partners', {
    label: 'شريط الشركاء',
    group: 'الموقع',
    icon: '<rect x="2.5" y="8" width="5.5" height="8" rx="1.6"/>' +
          '<rect x="10.5" y="8" width="5.5" height="8" rx="1.6"/>' +
          '<path d="M19 8v8M22 10.5v3"/>',
    render: function (mount) {
      return load().then(function () {
        mount.innerHTML = markup();
      });
    }
  });

  /* ------------------------------- الإجراءات ------------------------------- */
  IAQ.on('partnersPick', function (btn) {
    var id = btn.getAttribute('data-arg');
    if (!modeById(id)) { U.toast('نمط غير معروف', 'err'); return; }
    sel.mode = id;
    repaint();
  });

  IAQ.on('partnersUndo', function () {
    sel.mode = modeById(db.mode) ? db.mode : null;
    sel.speed = db.speed == null ? DEF_SPEED : clamp(db.speed);
    repaint();
    U.toast('أُعيدت القيم المخزَّنة');
  });

  IAQ.on('partnersReload', function () { IAQ.go('partners'); });

  IAQ.on('partnersSave', function (btn) {
    if (!sel.mode) { U.toast('اختر أحد الأنماط الثلاثة أولًا', 'warn'); return; }
    var el = U.$('#partners-speed');
    if (el) sel.speed = clamp(el.value);
    var sp = clamp(sel.speed);
    var who = (IAQ.me && IAQ.me.email) || null;

    btn.disabled = true;
    A.upsert('settings', [
      { key: K_MODE,  value: sel.mode, label: L_MODE,  is_public: true, updated_by: who },
      { key: K_SPEED, value: sp,       label: L_SPEED, is_public: true, updated_by: who }
    ], 'key').then(function (rows) {
      if (!rows || !rows.length) {
        throw new Error('لم تُرجع القاعدة أي صفّ — لم يُحفظ شيء. تأكّد من صلاحية الكتابة.');
      }
      IAQ.audit('settings.update', 'settings', K_MODE);
      U.toast('حُفظ النمط — يصل الزائر خلال خمس دقائق كحدّ أقصى', 'ok');
      IAQ.go('partners');
    })['catch'](function (e) {
      btn.disabled = false;
      U.toast(e.message || 'فشل الإجراء', 'err');
    });
  });

  /* مستمعان على مستوى المستند فقط — لا نربط شيئًا بعناصر نرسمها ثم نمحوها */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || t.id !== 'partners-speed') return;
    sel.speed = clamp(t.value);
    var v = U.$('#partners-speed-val');
    if (v) v.textContent = sel.speed + ' ث';
    var d = U.$('#partners-dirty');
    if (d) d.textContent = dirtyText();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var t = (e.target && e.target.closest) ? e.target.closest('[data-act="partnersPick"]') : null;
    if (!t) return;
    e.preventDefault();
    t.click();
  });
})();
