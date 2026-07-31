/* ============================================================================
   شاشة «لوحة المعلومات» — نظرة عامة.
   كل رقم هنا مقروء فعليًا من قاعدة البيانات عبر IAQ.api.count (ترويسة
   Content-Range). لا تقديرات، ولا رسوم بيانية مُختلقة، ولا «آخر نشر» مُفترض.

   ملاحظات مثبَّتة:
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة — لذلك الفراغ يُعرض كـ
     «لا توجد بيانات» ولا يُسمّى خطأ. وبالتالي العدّ الممنوع يرجع صفرًا لا خطأ،
     وهذا مُصرَّح به في الواجهة كي لا يُقرأ الصفر كحقيقة مطلقة.
   • فشل عدّاد واحد لا يُسقط الشاشة: يُعرض «—» مكان الرقم، ورسالة الخدمة
     الحقيقية تُعرض للمستخدم ولا تُبتلع.
   • الشاشة تُبنى بتسع قراءات متوازية؛ إن غادر المستخدم قبل وصولها لا نكتب
     نتيجتنا فوق الشاشة الأحدث.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  var KEY = 'dashboard';
  var run = 0;                       // رقم التشغيل — يمنع كتابة نتيجة قديمة فوق شاشة أحدث

  function msgOf(e) { return (e && e.message) ? String(e.message) : 'خطأ غير معروف'; }

  function uniq(a) {
    var out = [], i;
    for (i = 0; i < a.length; i++) if (out.indexOf(a[i]) < 0) out.push(a[i]);
    return out;
  }

  /* عدّاد لا يرمي: يرجع رقمًا، أو null مع تسجيل نصّ الخطأ في bag لعرضه لاحقًا */
  function cnt(table, q, bag) {
    return A.count(table, q).then(
      function (n) { return n; },
      function (e) { bag.push(msgOf(e)); return null; }
    );
  }

  /* هل غادر المستخدم هذه الشاشة أو أعاد تشغيلها؟ لا نكتب فوق شاشة أحدث */
  function stale(mine) {
    if (mine !== run) return true;
    var act = U.$('.nav-item.active');
    return !!(act && act.getAttribute('data-view') !== KEY);
  }

  /* الرقم للعرض — null تعني «تعذّرت القراءة» لا «صفر» */
  function val(n) { return n === null ? '—' : U.esc(F.num(n)); }

  function chip(cls, n, label) {
    return '<div class="sum-chip ' + cls + '">' +
      '<span class="scv">' + val(n) + '</span>' +
      '<span class="scl">' + U.esc(label) + '</span></div>';
  }

  function metric(n, label, cls) {
    return '<div class="metric' + (cls ? ' ' + cls : '') + '">' +
      '<div class="mv">' + val(n) + '</div>' +
      '<div class="ml">' + U.esc(label) + '</div></div>';
  }

  /* أيقونة صغيرة داخل دائرة الخطّ الزمني */
  function ic(paths) {
    return '<span class="tl-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg></span>';
  }

  var IC_ADD = '<path d="M12 5v14M5 12h14"/>';
  var IC_DEL = '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>';
  var IC_EDIT = '<path d="M4 20h4L20 8l-4-4L4 16v4z"/>';
  var IC_PUB = '<path d="M12 19V5M6 11l6-6 6 6"/>';
  var IC_LOG = '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>';

  /* اختيار الأيقونة من نصّ الإجراء — بلا تخمين معنى، مجرّد تصنيف بصري */
  function iconFor(action) {
    var a = String(action || '');
    if (a.indexOf('حذف') >= 0 || a.indexOf('delete') >= 0 || a.indexOf('remove') >= 0) return IC_DEL;
    if (a.indexOf('نشر') >= 0 || a.indexOf('publish') >= 0 || a.indexOf('رفع') >= 0 || a.indexOf('upload') >= 0) return IC_PUB;
    if (a.indexOf('إضافة') >= 0 || a.indexOf('انشاء') >= 0 || a.indexOf('إنشاء') >= 0 || a.indexOf('insert') >= 0 || a.indexOf('create') >= 0) return IC_ADD;
    if (a.indexOf('تعديل') >= 0 || a.indexOf('تحديث') >= 0 || a.indexOf('update') >= 0 || a.indexOf('edit') >= 0) return IC_EDIT;
    return IC_LOG;
  }

  function timelineHtml(rows, err) {
    /* null = فشل القراءة فعلًا (استثناء)، أمّا [] فقد تعني «لا سجلّات» أو «RLS تمنع» */
    if (rows === null) {
      return U.notice('<b>تعذّرت قراءة سجلّ التدقيق.</b><br>' +
        (err ? 'رسالة الخدمة: <span class="mono">' + U.esc(err) + '</span><br>' : '') +
        'الأرقام أعلاه غير متأثّرة بهذا الفشل.');
    }
    if (!rows.length) {
      return U.empty('لا توجد بيانات') +
        '<p class="small muted" style="text-align:center">لم تُسجَّل عمليات بعد، أو أنّ صلاحيتك لا تسمح بقراءة سجلّ التدقيق ' +
        '(القراءة الممنوعة ترجع قائمة فارغة لا رسالة خطأ، فلا يمكن التمييز بينهما من هنا).</p>';
    }
    return '<div class="timeline">' + rows.map(function (r) {
      var who = r.actor_email || 'غير معروف';
      var ent = r.entity ? U.esc(r.entity) + (r.entity_id ? ' <span class="mono">#' + U.esc(r.entity_id) + '</span>' : '') : '';
      return '<div class="tl-item">' + ic(iconFor(r.action)) + '<div>' +
        '<div class="tl-txt"><b>' + U.esc(r.action || '—') + '</b>' + (ent ? ' — ' + ent : '') + '</div>' +
        '<div class="tl-date">' + U.esc(who) + ' · ' + U.esc(F.date(r.created_at)) + '</div>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* بطاقة الصدق: ما هو سارٍ على الموقع فعلًا وما ينتظر إعادة البناء.
     المصدر المُتحقَّق منه: src/templates/iaq-runtime.js — مهلته 300000مل (5 دقائق)،
     ويقرأ settings حيث is_public=is.true، و content_overrides حيث status=eq.published
     مع or=(page.eq.<slug>,page.eq.*)، ثم يتخطّى أي تعديل لا تُطابق بصمته الأصل. */
  function liveCardHtml() {
    return U.notice(
      '<b>يُطبَّق على الموقع تلقائيًا خلال 5 دقائق كحدّ أقصى:</b>' +
      '<ul style="margin-block-start:8px;padding-inline-start:20px">' +
      '<li><b>التعديلات النصّية</b> (content_overrides) — بثلاثة شروط مجتمعة: أن تكون حالتها «منشور»، ' +
      'وأن تكون الصفحة المستهدفة هي صفحة الزائر نفسها أو <span class="mono">*</span>، ' +
      'وأن تُطابق بصمة النصّ الأصلي ما هو موجود في الصفحة فعلًا — فإن تغيّرت بنية الصفحة بعد إعادة البناء ' +
      'يُتخطّى التعديل بصمت حمايةً من وضع النصّ في موضع خاطئ.</li>' +
      '<li><b>الإعدادات</b> (settings) — بشرط أن يكون الحقل <span class="mono">is_public</span> مُفعَّلًا.</li>' +
      '</ul>' +
      '<div class="small" style="margin-block-start:8px">صفحات الموقع تحمل نصًّا يقرأ هذين الجدولين ويخزّنهما في المتصفّح لمدة 5 دقائق، ' +
      'فالزائر الذي فتح الصفحة قبل قليل قد يرى النصّ القديم حتى انتهاء هذه المدة أو تحديث الصفحة.</div>', 'ok') +

      U.notice(
        '<b>لا يظهر على الموقع إلا بعد إعادة بناء الموقع ونشره:</b>' +
        '<ul style="margin-block-start:8px;padding-inline-start:20px">' +
        '<li><b>الأخبار</b> (news) — صفحة الأخبار صفحة ثابتة تُبنى من ملفات <span class="mono">src/data</span>.</li>' +
        '<li><b>الوثائق</b> (documents) — قوائم الوثائق والتراخيص تُبنى بالطريقة نفسها.</li>' +
        '<li><b>الطلبات والاستبيانات</b> لا تُنشر على الموقع أصلًا؛ هي بيانات داخلية للوحة فقط.</li>' +
        '</ul>' +
        '<div class="small" style="margin-block-start:8px">إضافة خبر أو وثيقة هنا تحفظ السجلّ في قاعدة البيانات فورًا، ' +
        'لكن زائر الموقع لن يراه حتى يُعاد توليد الصفحات الثابتة ونشرها. لا تعتبر السجلّ منشورًا للجمهور قبل ذلك.</div>') +

      '<p class="small muted" style="margin-block-start:12px">الملف المرفوع إلى المستودع يصبح رابطه العام صالحًا فورًا، ' +
      'لكن ظهوره <b>داخل صفحة</b> يبقى مرهونًا بتعديل نصّي منشور أو بإعادة البناء.</p>';
  }

  IAQ.views.register(KEY, {
    label: 'لوحة المعلومات',
    group: 'عام',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
          '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    render: function (mount) {
      run++;
      var mine = run;
      var bag = [];                  // رسائل أخطاء العدّادات الحقيقية
      var auditErr = '';

      mount.innerHTML = U.spinner('جارٍ قراءة الأرقام من قاعدة البيانات…');

      return Promise.all([
        cnt('submissions', 'select=id', bag),
        cnt('submissions', 'select=id&status=eq.new', bag),
        cnt('survey_responses', 'select=id', bag),
        cnt('news', 'select=id', bag),
        cnt('news', 'select=id&status=eq.published', bag),
        cnt('documents', 'select=id', bag),
        cnt('content_overrides', 'select=id&status=eq.published', bag),
        cnt('media', 'select=id', bag),
        A.select('audit_log', 'select=actor_email,action,entity,entity_id,created_at&order=created_at.desc&limit=8')
          .then(
            function (rows) { return rows || []; },
            function (e) { auditErr = msgOf(e); return null; }
          )
      ]).then(function (r) {
        if (stale(mine)) return;

        var subsAll = r[0], subsNew = r[1], surveys = r[2],
            newsAll = r[3], newsPub = r[4], docsAll = r[5],
            ovrPub = r[6], mediaAll = r[7], logRows = r[8];

        var dead = 0, i;
        for (i = 0; i < 8; i++) if (r[i] === null) dead++;
        var errTxt = uniq(bag).join(' / ');

        var top = '';
        if (dead === 8) {
          top = U.notice('<b>تعذّرت قراءة كل العدّادات.</b><br>' +
            (errTxt ? 'رسالة الخدمة: <span class="mono">' + U.esc(errTxt) + '</span><br>' : '') +
            'الأرقام أدناه معروضة كـ«—» ولم تُخمَّن.');
        } else if (dead > 0) {
          top = U.notice('تعذّرت قراءة ' + U.esc(F.num(dead)) + ' من العدّادات؛ ظهرت بعلامة «—» بدل رقم مُخترع.' +
            (errTxt ? '<br>رسالة الخدمة: <span class="mono">' + U.esc(errTxt) + '</span>' : ''));
        }

        var chips = '<div class="sum-chips">' +
          chip('cl', subsAll, 'إجمالي الطلبات والرسائل') +
          chip('nw', subsNew, 'طلبات جديدة لم تُعالَج') +
          chip('pr', surveys, 'استجابات الاستبيانات') +
          chip('rp', mediaAll, 'ملفات في مكتبة الوسائط') +
          '</div>';

        var metrics = '<div class="metric-grid">' +
          metric(newsAll, 'سجلّات الأخبار (الكل)') +
          metric(newsPub, 'أخبار بحالة «منشور»') +
          metric(docsAll, 'سجلّات الوثائق') +
          metric(ovrPub, 'تعديلات نصّية بحالة «منشور»') +
          '</div>';

        var refresh = '<button class="btn ghost sm" data-act="dashRefresh">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
          'stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"/></svg>تحديث الأرقام</button>';

        mount.innerHTML =
          U.head('لوحة المعلومات', 'أرقام مقروءة الآن من قاعدة البيانات مباشرة.') +
          top +
          U.card('نظرة عامة', chips + metrics +
            '<p class="small muted">«أخبار بحالة منشور» تعني حالة السجلّ في قاعدة البيانات فقط، وليست تأكيدًا لظهورها على الموقع — ' +
            'انظر البطاقة الأخيرة. و«تعديلات نصّية بحالة منشور» هو العدد الكلّي لكل الصفحات؛ وهي النوع الوحيد الذي ' +
            '<b>يمكن</b> أن يُطبَّق دون إعادة بناء، لكن تطبيقه الفعلي مشروط ولم يُتحقَّق منه هنا.</p>' +
            '<p class="small muted">وإن لم تسمح صلاحيتك بقراءة جدول، فالعدّ يرجع صفرًا لا خطأً؛ ' +
            'فالصفر هنا يعني «لا سجلّات مرئية لحسابك» لا «لا سجلّات في قاعدة البيانات».</p>',
            refresh) +
          U.card('أحدث العمليات في سجلّ التدقيق (حتى 8)', timelineHtml(logRows, auditErr)) +
          U.card('ماذا يظهر على الموقع الآن؟', liveCardHtml());
      }).catch(function (e) {
        if (stale(mine)) return;
        mount.innerHTML = U.head('لوحة المعلومات') +
          U.notice('<b>تعذّر بناء الشاشة.</b><br>' + U.esc(msgOf(e)));
        U.toast(msgOf(e), 'err');
      });
    }
  });

  IAQ.on('dashRefresh', function () { IAQ.go(KEY); });
})();
