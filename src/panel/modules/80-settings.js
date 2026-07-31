/* ============================================================================
   شاشة «الإعدادات» — محرّر عامّ لجدول public.settings.
   القيمة (value) من نوع jsonb، لذلك يُبنى عنصر التحكّم حسب نوع القيمة الفعليّ:
   منطقيّ ← مفتاح تشغيل، رقم ← حقل رقميّ، نصّ ← حقل نصّيّ، فارغة (null) ← حقل نصّيّ
   خالٍ، كائن/مصفوفة ← مساحة نصّ تحمل JSON ويُشترط أن يُحلَّل قبل الحفظ.
   الحفظ يرسل الصفوف المتغيّرة فقط عبر upsert على المفتاح key.
   ملاحظة مثبَّتة: القراءة الممنوعة بـRLS ترجع مصفوفة فارغة لا خطأ، فلا ندّعي فشلًا.
   ============================================================================ */
(function () {
  'use strict';
  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;

  /* الحقول المرسومة حاليًا — يُعاد بناؤها مع كل رسم، ويقرؤها زرّ الحفظ عند الضغط */
  var FIELDS = [];

  /* نوع القيمة كما وصلت من jsonb */
  function kindOf(v) {
    if (v === null || typeof v === 'undefined') return 'null';
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return 'num';
    if (typeof v === 'string') return 'str';
    return 'json';                       // كائن أو مصفوفة
  }

  var KIND_AR = { bool: 'منطقيّة (نعم/لا)', num: 'رقم', str: 'نصّ', 'null': 'فارغة', json: 'JSON' };

  /* عنصر تحكّم واحد + سطر خطأ فارغ يُملأ عند فشل التحقّق */
  function fieldHtml(r, i, t) {
    var vid = 'settings-v-' + i;
    var lab = r.label ? U.esc(r.label) + ' <span class="mono">' + U.esc(r.key) + '</span>'
                      : '<span class="mono">' + U.esc(r.key) + '</span>';
    var chip = '<span class="chip">' + (r.is_public ? 'علنيّ (يقرؤه الزوّار)' : 'داخليّ') + '</span>';
    var ctl = '', hint = '';

    if (t === 'bool') {
      ctl = '<div class="prow">' +
        '<button type="button" class="switch' + (r.value ? ' on' : '') + '" id="' + vid + '"' +
        ' data-act="settingsToggle" data-arg="' + i + '" role="switch" aria-checked="' +
        (r.value ? 'true' : 'false') + '" aria-label="' + U.esc(r.label || r.key) + '"><span></span></button>' +
        '<span class="small" id="settings-bl-' + i + '">' + (r.value ? 'مُفعَّل' : 'معطَّل') + '</span></div>';
    } else if (t === 'num') {
      ctl = '<input type="number" step="any" id="' + vid + '" value="' + U.esc(r.value) + '">';
    } else if (t === 'json') {
      ctl = '<textarea id="' + vid + '" rows="8" dir="ltr" spellcheck="false">' +
        U.esc(JSON.stringify(r.value, null, 2)) + '</textarea>';
      hint = '<div class="small muted">قيمة JSON — لن تُحفظ إن كانت الصيغة غير صحيحة.</div>';
    } else if (t === 'null') {
      ctl = '<input type="text" id="' + vid + '" value="">';
      hint = '<div class="small muted">القيمة الحالية فارغة (null). اتركها فارغة لتبقى كذلك، أو اكتب نصًّا ليُحفظ كنصّ.</div>';
    } else {
      ctl = '<input type="text" id="' + vid + '" value="' + U.esc(r.value) + '">';
    }

    var meta = '<div class="small muted">النوع: ' + U.esc(KIND_AR[t] || t) +
      (r.updated_at ? ' · آخر تحديث: ' + U.esc(F.date(r.updated_at)) : '') +
      (r.updated_by ? ' · بواسطة ' + U.esc(r.updated_by) : '') + '</div>';

    return '<div class="fld"><label>' + lab + ' ' + chip + '</label>' + ctl + hint +
      '<div id="settings-err-' + i + '"></div>' + meta + '</div>';
  }

  /* بطاقة صريحة: ما لا يمكن تعديله من هنا لأنه يُدمج في الصفحات وقت البناء */
  function staticCard() {
    var f = '<span class="mono">src/data/contact.json</span>';
    return U.card('ما لا يُعدَّل من هذه الشاشة',
      '<p class="small">صفحات الموقع صفحات HTML ثابتة تُبنى مسبقًا من ملفات المصدر، فالقيم التالية ' +
      'ليست مخزَّنة في قاعدة البيانات ولا يمكن لهذه الشاشة تغييرها — ولذلك لا نعرض لها أزرارًا ' +
      'لأنّها لن تعمل:</p>' +
      U.table(['العنصر', 'من أين يُعدَّل فعلًا'], [
        ['بيانات التواصل: الهاتف، البريد، العنوان', f + ' ثم إعادة البناء والنشر'],
        ['رقم الترخيص', f + ' ثم إعادة البناء والنشر'],
        ['روابط التواصل الاجتماعي', f + ' ثم إعادة البناء والنشر'],
        ['رابط التبرّع ومتجر التبرعات', f + ' ثم إعادة البناء والنشر'],
        ['النصوص الظاهرة في الصفحات',
          'شاشة «المحتوى» في هذه اللوحة — وهي أيضًا تُخزِّن التعديل في قاعدة البيانات ' +
          'ولا يظهر على الموقع إلا بعد إعادة البناء والنشر']
      ]));
  }

  IAQ.views.register('settings', {
    label: 'الإعدادات',
    group: 'الموقع',
    icon: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    render: function (mount) {
      FIELDS = [];
      return A.select('settings', 'select=key,value,label,is_public,updated_at,updated_by&order=key.asc')
        .then(function (rows) {
          rows = rows || [];
          var h = U.head('الإعدادات', 'قيم عامة مخزَّنة في جدول settings بقاعدة البيانات');

          h += U.notice('<b>هذه القيم تُخزَّن في قاعدة البيانات فقط.</b><br>' +
            'صفحات الموقع ثابتة ومبنيّة مسبقًا، فتعديل قيمة هنا لا يُغيّر ما يراه الزوّار حتى ' +
            'إعادة بناء الموقع ونشره. ووسم «علنيّ» يعني أنّ القيمة قابلة للقراءة من واجهة ' +
            'البيانات دون تسجيل دخول، لا أنّها ظاهرة في صفحة ما.');

          if (!rows.length) {
            h += U.card('قيم الموقع',
              U.empty('لا توجد بيانات') +
              '<p class="small muted">جدول settings لا يحتوي صفوفًا، أو أنّ دورك الحالي لا يسمح ' +
              'بقراءته — القراءة الممنوعة تُرجع نتيجة فارغة لا رسالة خطأ، فلا يمكن التمييز بينهما ' +
              'من هنا.</p>');
            h += staticCard();
            mount.innerHTML = h;
            return;
          }

          var body = '';
          rows.forEach(function (r, i) {
            var t = kindOf(r.value);
            FIELDS.push({ key: r.key, type: t, orig: typeof r.value === 'undefined' ? null : r.value });
            body += fieldHtml(r, i, t);
          });

          h += U.card('قيم الموقع (' + F.num(rows.length) + ')', body,
            '<button class="btn ghost" data-act="settingsReset">تجاهل التغييرات</button>' +
            '<button class="btn ok" data-act="settingsSave">حفظ الإعدادات</button>');

          h += U.card('سجلّ الإجراء',
            '<p class="small muted">لا تُرسَل إلى قاعدة البيانات إلا الحقول التي غيّرتها فعلًا، ' +
            'ويُسجَّل بريدك في خانة «بواسطة» لكل قيمة حفظتها. وتُحاول اللوحة كذلك تسجيل ' +
            'العملية في سجلّ التدقيق؛ وإن مُنع هذا التسجيل فلن يُلغى الحفظ ولن تظهر رسالة خطأ.</p>');

          h += staticCard();
          mount.innerHTML = h;
        });
    }
  });

  /* تبديل المفتاح المنطقيّ — تعديل عنصر قائم، بلا مستمعين جديدة */
  IAQ.on('settingsToggle', function (btn) {
    var on = !btn.classList.contains('on');
    if (on) btn.classList.add('on'); else btn.classList.remove('on');
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
    var lbl = U.$('#settings-bl-' + btn.getAttribute('data-arg'));
    if (lbl) lbl.textContent = on ? 'مُفعَّل' : 'معطَّل';
  });

  /* تجاهل التغييرات يفقد ما كتبه المستخدم ولم يُحفظ — نسأل أولًا */
  IAQ.on('settingsReset', function () {
    U.ask('تجاهل كل التعديلات التي لم تُحفظ، وإعادة تحميل القيم من قاعدة البيانات؟', 'تجاهل التعديلات')
      .then(function (yes) { if (yes) IAQ.go('settings'); })['catch'](function (e) {
        U.toast(e.message || 'فشل الإجراء', 'err');
      });
  });

  IAQ.on('settingsSave', function (btn) {
    if (!FIELDS.length) { U.toast('لا توجد قيم للحفظ', 'warn'); return; }

    var changed = [], bad = 0, i, f, el, nv, raw, err;

    for (i = 0; i < FIELDS.length; i++) {
      f = FIELDS[i];
      el = U.$('#settings-v-' + i);
      err = U.$('#settings-err-' + i);
      if (err) err.innerHTML = '';
      if (!el) continue;

      if (f.type === 'bool') {
        nv = el.classList.contains('on');
      } else if (f.type === 'num') {
        raw = String(el.value).replace(/^\s+|\s+$/g, '');
        // isFinite ضروريّ: Infinity و1e999 تمرّان من isNaN، وJSON يحوّلهما إلى null بصمت
        if (raw === '' || !isFinite(Number(raw))) {
          if (err) err.innerHTML = U.notice('هذه القيمة رقميّة — أدخل رقمًا صحيحًا ومحدودًا.');
          bad++; continue;
        }
        nv = Number(raw);
      } else if (f.type === 'json') {
        raw = String(el.value).replace(/^\s+|\s+$/g, '');
        if (raw === '') {
          if (err) err.innerHTML = U.notice('لا يمكن ترك قيمة JSON فارغة — اكتب <span class="mono">[]</span> أو <span class="mono">{}</span> إن أردت إفراغها.');
          bad++; continue;
        }
        try { nv = JSON.parse(raw); }
        catch (ex) {
          if (err) err.innerHTML = U.notice('صيغة JSON غير صحيحة: ' + U.esc(ex && ex.message ? ex.message : ex));
          bad++; continue;
        }
      } else if (f.type === 'null') {
        raw = String(el.value);
        nv = raw.replace(/^\s+|\s+$/g, '') === '' ? null : raw;
      } else {
        nv = String(el.value);
      }

      if (JSON.stringify(nv) !== JSON.stringify(f.orig)) changed.push({ key: f.key, value: nv });
    }

    if (bad) { U.toast('صحّح الحقول المعلَّمة (' + bad + ') ثم أعد الحفظ', 'err'); return; }
    if (!changed.length) { U.toast('لا توجد تغييرات للحفظ', 'warn'); return; }

    /* «بواسطة» لا يضبطه أي مُشغِّل في قاعدة البيانات، فلو لم نُرسله بقيت النسبة
       للمحرّر السابق مع تاريخ جديد — أي عرض معلومة خاطئة في الشاشة */
    var s = IAQ.session();
    var who = (IAQ.me && IAQ.me.email) || (s && s.email) || '';
    var keys = changed.map(function (r) { return r.key; }).join(',');
    var stamp = new Date().toISOString();
    var payload = changed.map(function (r) {
      var o = { key: r.key, value: r.value, updated_at: stamp };
      if (who) o.updated_by = who;   // مفاتيح كل الصفوف متطابقة — شرط PostgREST للإدراج الجماعي
      return o;
    });

    btn.disabled = true;
    A.upsert('settings', payload, 'key').then(function (out) {
      if (!out || !out.length) {
        btn.disabled = false;
        U.toast('لم يُرجِع الخادم أيّ صفّ محدَّث — لم يُحفظ شيء على الأرجح', 'warn');
        return null;
      }
      return IAQ.audit('settings.update', 'settings', keys).then(function () { return out; });
    }).then(function (out) {
      if (!out) return;
      U.toast('تم حفظ ' + F.num(out.length) + ' قيمة');
      IAQ.go('settings');
    })['catch'](function (e) {
      btn.disabled = false;
      U.toast(e.message || 'فشل الإجراء', 'err');
    });
  });
})();
