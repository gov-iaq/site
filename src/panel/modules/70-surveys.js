/* ============================================================================
   وحدة: نتائج قياس الرضا  (المفتاح: surveys)
   تقرأ public.survey_responses كما هي وتحسب المتوسطات الحقيقية لكل سؤال.
   لا تُخترع أي أرقام: كل رقم هنا مشتقّ من صفوف قرأناها فعلًا من قاعدة البيانات.
   الردود مجهولة المصدر بالتصميم (لا اسم ولا بريد ولا IP) — لذلك لا يوجد أي
   ربط بشخص، والحذف نهائي لأنه لا توجد نسخة أخرى من الردّ.
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var LIMIT = 500;          // أقصى عدد ردود نقرؤها في الطلب الواحد
  var TBL_MAX = 200;        // أقصى عدد صفوف نعرضها في جدول الملاحظات
  var TYPE = 'visitors';    // التصنيف المعروض حاليًا
  var CACHE = null;         // الصفوف المقروءة (كل التصنيفات) — تُفرَّغ بعد كل حذف
  var LOADED = 0;           // وقت آخر قراءة فعلية من قاعدة البيانات

  var TYPES = [
    { k: 'visitors', t: 'رضا الزوّار' },
    { k: 'beneficiaries', t: 'رضا المستفيدين' },
    { k: 'donors', t: 'رضا الداعمين' }
  ];

  /* مفاتيح ratings كما يخزّنها الموقع العام فعلًا: نموذج قياس الرضا يقرأ نصّ
     السؤال من عنصر .qt ويستعمله مفتاحًا (انظر templates/footer.html)، فالمفتاح
     هو جملة السؤال بالعربية لا رمزًا مختصرًا مثل vq0. لذلك الأصل أن نعرض
     المفتاح كما ورد في قاعدة البيانات، والخريطة أدناه احتياط لصفوف قديمة أو
     مُدرَجة يدويًا بالرموز المختصرة فقط. */
  var QLABEL = {
    vq0: 'سهولة تصفّح الموقع والوصول للمعلومة',
    vq1: 'وضوح المحتوى وكفايته',
    vq2: 'سرعة الموقع وأداؤه',
    vq3: 'تجربتك العامة مع الموقع',
    bq0: 'جودة البرامج والخدمات المقدّمة',
    bq1: 'مدى تلبية البرامج لاحتياجاتك',
    bq2: 'احترافية فريق العمل والتعامل',
    bq3: 'الأثر الذي لمسته على جمعيتك',
    dq0: 'وضوح التواصل والتقارير المرسلة إليك',
    dq1: 'شفافية الجمعية في صرف التبرعات وتوثيق الأثر',
    dq2: 'سرعة الاستجابة لملاحظاتك واستفساراتك',
    dq3: 'ثقتك العامة في الجمعية ورضاك عن الشراكة'
  };

  function typeName(k) {
    var i;
    for (i = 0; i < TYPES.length; i++) if (TYPES[i].k === k) return TYPES[i].t;
    return k;
  }
  function qLabel(k) {
    var s = String(k == null ? '' : k);
    if (Object.prototype.hasOwnProperty.call(QLABEL, s)) return QLABEL[s];
    if (s.replace(/\s/g, '') === '') return 'سؤال بلا نصّ في قاعدة البيانات';
    return s;
  }

  function isObj(v) {
    return !!v && typeof v === 'object' &&
           Object.prototype.toString.call(v) !== '[object Array]';
  }

  /* --------------------------- حساب المتوسطات --------------------------- */
  /* يمرّ على الصفوف مرّة واحدة: مجموع وعدد لكل مفتاح سؤال على حدة، حتى لا
     يتأثّر متوسط سؤال بردّ لم يُجب عليه. */
  /* القيمة المقبولة درجة على مقياس 1..5؛ أي شيء آخر (نصّ، فراغ، أو رقم خارج
     المدى) يُستثنى من الحساب ويُعدّ ويُعلَن عنه بدل تشويه المتوسط. */
  function grade(raw) {
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
    var v = Number(raw);
    if (!isFinite(v) || v < 1 || v > 5) return null;
    return v;
  }

  function collect(rows) {
    var keys = [], sums = {}, cnts = {};
    var total = 0, answers = 0, sumAll = 0, noRating = 0, bad = 0;
    var i, r, rt, k, v, used;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      total++;
      rt = r ? r.ratings : null;
      if (!isObj(rt)) { noRating++; continue; }
      used = 0;
      for (k in rt) {
        if (!Object.prototype.hasOwnProperty.call(rt, k)) continue;
        v = grade(rt[k]);
        if (v === null) { bad++; continue; }
        if (cnts[k] === undefined) { cnts[k] = 0; sums[k] = 0; keys.push(k); }
        cnts[k] += 1; sums[k] += v;
        answers++; sumAll += v; used++;
      }
      if (!used) noRating++;
    }
    keys.sort();
    return { keys: keys, sums: sums, cnts: cnts, total: total,
             answers: answers, sumAll: sumAll, noRating: noRating, bad: bad };
  }

  function rowAvg(r) {
    var rt = r ? r.ratings : null, k, v, s = 0, n = 0;
    if (!isObj(rt)) return null;
    for (k in rt) {
      if (!Object.prototype.hasOwnProperty.call(rt, k)) continue;
      v = grade(rt[k]);
      if (v === null) continue;
      s += v; n++;
    }
    return n ? (s / n) : null;
  }

  function barColor(avg) {
    if (avg >= 4) return '#007878';
    if (avg >= 3) return '#c09048';
    return '#c0563a';
  }

  /* ------------------------------ التحميل ------------------------------ */
  function load() {
    if (CACHE) return Promise.resolve(CACHE);
    return A.select('survey_responses',
      'select=id,survey_type,ratings,program,comment,created_at' +
      '&order=created_at.desc&limit=' + LIMIT
    ).then(function (rows) {
      CACHE = rows || [];
      LOADED = Date.now();
      return CACHE;
    });
  }

  /* ------------------------------ الرسم ------------------------------ */
  function filterbar(all) {
    var counts = {}, i, t;
    for (i = 0; i < all.length; i++) {
      t = all[i] && all[i].survey_type ? String(all[i].survey_type) : '—';
      counts[t] = (counts[t] || 0) + 1;
    }
    var h = '<div class="filterbar">';
    for (i = 0; i < TYPES.length; i++) {
      h += '<button class="btn sm ' + (TYPES[i].k === TYPE ? 'ok' : 'ghost') +
           '" data-act="svType" data-arg="' + U.esc(TYPES[i].k) + '">' +
           U.esc(TYPES[i].t) + ' (' + F.num(counts[TYPES[i].k] || 0) + ')</button>';
    }
    h += '<button class="btn sm ghost" data-act="svReload">إعادة القراءة من القاعدة</button>';
    h += '</div>';
    return h;
  }

  function metrics(st) {
    var avg = st.answers ? (st.sumAll / st.answers) : 0;
    var cls = st.answers ? (avg >= 4 ? ' ok' : (avg < 3 ? ' warn' : '')) : '';
    var pct = st.answers ? (avg / 5 * 100) : 0;
    return '<div class="metric-grid">' +
      '<div class="metric' + cls + '"><div class="mv">' +
        (st.answers ? avg.toFixed(2) + ' / 5' : '—') +
        '</div><div class="ml">المتوسط العام لكل الإجابات</div></div>' +
      '<div class="metric"><div class="mv">' +
        (st.answers ? pct.toFixed(0) + '%' : '—') +
        '</div><div class="ml">نسبة الرضا (المتوسط ÷ 5)</div></div>' +
      '<div class="metric"><div class="mv">' + F.num(st.total) +
        '</div><div class="ml">عدد ردود هذا التصنيف</div></div>' +
      '<div class="metric"><div class="mv">' + F.num(st.answers) +
        '</div><div class="ml">عدد الإجابات الرقمية فيها</div></div>' +
    '</div>';
  }

  function hbars(st) {
    if (!st.keys.length) {
      return U.empty('لا توجد إجابات رقمية صالحة في هذه الردود.');
    }
    var h = '<div class="hbars">', i, k, avg, pct, lbl;
    for (i = 0; i < st.keys.length; i++) {
      k = st.keys[i];
      avg = st.sums[k] / st.cnts[k];
      pct = avg / 5 * 100;
      if (pct < 0) pct = 0;
      if (pct > 100) pct = 100;
      /* المفتاح جملة سؤال كاملة وعمود العنوان ضيّق — نقصّه للعرض ونضع النصّ
         الكامل في تلميح، بلا حذف أي معلومة. */
      lbl = qLabel(k);
      h += '<div class="hbar">' +
        '<div class="hb-label" title="' + U.esc(lbl) + '">' + U.esc(F.cut(lbl, 44)) +
          ' <span class="muted small">(' + F.num(st.cnts[k]) + ')</span></div>' +
        '<div class="hb-track"><div class="hb-fill" style="width:' + pct.toFixed(1) +
          '%;background:' + barColor(avg) + '"></div></div>' +
        '<div class="hb-val">' + avg.toFixed(2) + '</div>' +
      '</div>';
    }
    h += '</div>';
    h += '<p class="muted small" style="margin-block-start:14px">' +
      'الرقم بين القوسين = عدد الردود التي أجابت على هذا السؤال تحديدًا، ' +
      'وطول الشريط = المتوسط ÷ 5. عدد الأسئلة المقاسة: ' + F.num(st.keys.length) + '. ' +
      'وتنبيه لازم لقراءة الأرقام: نموذج الموقع يخزّن كل سؤال بمفتاح هو نصّ ' +
      'السؤال كما كان مكتوبًا لحظة الإرسال، فإن عُدِّلت صياغة سؤال لاحقًا ظهرت ' +
      'الصياغة الجديدة سؤالًا منفصلًا بردوده وحدها، وبقيت ردود الصياغة القديمة ' +
      'في سطر آخر — فلا تُجمع المتوسطات بينهما تلقائيًا.' +
      '</p>';
    return h;
  }

  var DEL_ICON = '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>';

  function commentsTable(list) {
    var withText = 0, i, shown, cols, body = [], r, av, cells;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].comment && String(list[i].comment).replace(/\s/g, '') !== '') withText++;
    }
    shown = list.length > TBL_MAX ? list.slice(0, TBL_MAX) : list;

    cols = ['التاريخ'];
    if (TYPE === 'beneficiaries') cols.push('البرنامج');
    cols.push('الملاحظة النصّية', 'متوسط الردّ', 'حذف');

    for (i = 0; i < shown.length; i++) {
      r = shown[i];
      av = rowAvg(r);
      cells = ['<span class="small">' + U.esc(F.date(r.created_at)) + '</span>'];
      if (TYPE === 'beneficiaries') {
        cells.push(r.program ? U.esc(F.cut(String(r.program), 60))
                             : '<span class="muted">—</span>');
      }
      cells.push(r.comment && String(r.comment).replace(/\s/g, '') !== ''
        ? U.esc(F.cut(String(r.comment), 260))
        : '<span class="muted">لا ملاحظة</span>');
      cells.push(av === null ? '<span class="muted">—</span>'
                             : '<b class="mono">' + av.toFixed(2) + '</b>');
      cells.push('<div class="acts">' + U.iconBtn('svDel', DEL_ICON,
        { id: r.id, danger: true, sm: true, label: 'حذف هذا الردّ نهائيًا' }) + '</div>');
      body.push(cells);
    }

    var h = '<p class="muted small" style="margin-block-end:12px">' +
      'ردود تحتوي ملاحظة نصّية: ' + F.num(withText) + ' من ' + F.num(list.length) + '.' +
      (list.length > TBL_MAX ? ' يُعرض أحدث ' + F.num(TBL_MAX) + ' ردّ فقط في الجدول.' : '') +
      '</p>' + U.table(cols, body);
    return h;
  }

  /* ------------------------------ الشاشة ------------------------------ */
  IAQ.views.register('surveys', {
    label: 'نتائج قياس الرضا',
    group: 'التفاعل',
    icon: '<path d="M3 20h18M7 20v-8M12 20V5M17 20v-6"/>',
    render: function (mount) {
      return load().then(function (all) {
        var i, list = [], r;
        for (i = 0; i < all.length; i++) {
          r = all[i];
          if (r && String(r.survey_type) === TYPE) list.push(r);
        }
        var st = collect(list);

        var h = U.head('نتائج قياس الرضا',
          'متوسطات محسوبة من ردود الاستبانات المخزّنة في قاعدة البيانات.');

        h += U.notice(
          '<b>الردود مجهولة المصدر بالتصميم.</b><br>' +
          'جدول الردود لا يحتوي اسمًا ولا بريدًا ولا رقم هاتف ولا عنوان IP — لا يُخزَّن ' +
          'سوى التقييمات الرقمية والملاحظة النصّية وتاريخ الإرسال، فلا يمكن ربط أي ردّ ' +
          'بشخص معيّن ولا التحقّق من مُرسِله ولا التواصل معه.');

        h += U.notice(
          '<b>هذه الأرقام لا تظهر على الموقع العام.</b><br>' +
          'صفحة «قياس الرضا» في الموقع صفحة HTML ثابتة يولّدها build.py، والنِّسب ' +
          'المعروضة فيها مكتوبة داخل المصدر ومُعلَّم عليها أنها بيانات توضيحية. ' +
          'لعرض النتائج الحقيقية على الموقع يجب تحديث مصدر البناء ثم إعادة البناء والنشر.');

        if (!all.length) {
          h += U.card('الردود',
            U.empty('لا توجد بيانات') +
            '<p class="muted small" style="text-align:center">القراءة الفارغة قد تعني ' +
            'عدم وجود ردود، أو أن سياسة الصلاحيات لا تسمح لحسابك بقراءة هذا الجدول — ' +
            'الاستجابة واحدة في الحالتين فلا نستطيع التمييز بينهما.</p>');
          mount.innerHTML = h;
          return;
        }

        if (all.length >= LIMIT) {
          h += U.notice('قُرئ أحدث ' + F.num(LIMIT) + ' ردّ فقط (حدّ الطلب الواحد)، ' +
            'فالمتوسطات والأعداد أدناه تخصّ هذه الدفعة لا كل تاريخ الجدول.');
        }

        h += filterbar(all);

        if (!list.length) {
          h += U.card('نتائج ' + typeName(TYPE),
            U.empty('لا توجد بيانات') +
            '<p class="muted small" style="text-align:center">لا يوجد أي ردّ من نوع «' +
            U.esc(typeName(TYPE)) + '» ضمن الردود المقروءة.</p>');
          mount.innerHTML = h;
          return;
        }

        h += metrics(st);
        h += U.card('متوسط كل سؤال — ' + typeName(TYPE), hbars(st));

        if (st.noRating || st.bad) {
          h += U.notice(
            (st.noRating ? 'عدد الردود بلا أي تقييم صالح: ' + F.num(st.noRating) +
                           ' (استُثنيت من المتوسطات). ' : '') +
            (st.bad ? 'عدد القيم المستثناة لأنها ليست درجة بين 1 و5: ' +
                      F.num(st.bad) + '.' : ''));
        }

        h += U.card('الردود والملاحظات النصّية — ' + typeName(TYPE),
          commentsTable(list),
          '<span class="muted small">' +
          'الحذف يزيل الردّ من قاعدة البيانات نهائيًا: لا سلّة محذوفات ولا نسخة ' +
          'احتياطية داخل اللوحة، وبما أن الردّ مجهول المصدر فلا يمكن إعادة تجميعه.' +
          '</span>');

        h += '<p class="muted small">آخر قراءة للبيانات من قاعدة البيانات: ' +
          U.esc(F.date(new Date(LOADED).toISOString())) + '.</p>';

        mount.innerHTML = h;
      }).catch(function (e) {
        mount.innerHTML = U.head('نتائج قياس الرضا') +
          U.notice('<b>تعذّر قراءة الردود.</b><br>' +
                   U.esc(e && e.message ? e.message : String(e)));
        U.toast((e && e.message) || 'فشل الإجراء', 'err');
      });
    }
  });

  /* ------------------------------ الأحداث ------------------------------ */
  IAQ.on('svType', function (btn) {
    var k = btn.getAttribute('data-arg');
    if (!k) return;
    TYPE = k;
    IAQ.go('surveys');
  });

  IAQ.on('svReload', function () {
    CACHE = null;
    IAQ.go('surveys');
  });

  IAQ.on('svDel', function (btn) {
    var id = btn.getAttribute('data-id');
    U.ask('سيُحذف هذا الردّ من قاعدة البيانات نهائيًا. الحذف غير قابل للتراجع، ' +
          'ولا توجد نسخة أخرى منه لأن الردّ مجهول المصدر. متابعة؟', 'حذف نهائي')
      .then(function (ok) {
        if (!ok) return null;
        return A.remove('survey_responses', id).then(function (rows) {
          if (!rows || !rows.length) {
            U.toast('لم يُحذف أي صفّ — تحقّق من صلاحيتك أو من وجود الردّ.', 'warn');
            return null;
          }
          IAQ.audit('delete_survey_response', 'survey_responses', id);
          CACHE = null;
          U.toast('حُذف الردّ نهائيًا', 'ok');
          IAQ.go('surveys');
          return null;
        });
      })
      .catch(function (e) {
        U.toast((e && e.message) || 'فشل الإجراء', 'err');
      });
  });
})();
