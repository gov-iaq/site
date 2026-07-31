/* ============================================================================
   شاشة «الطلبات والرسائل» — صندوق الوارد لجدول public.submissions.
   الحمولة (payload) قادمة من نماذج زوّار الموقع: شكلها غير مضمون ومحتواها
   غير موثوق، فلا نفترض وجود أي مفتاح، ونُمرّر كل قيمة عبر esc قبل عرضها.
   لا توجد في اللوحة قدرة إرسال بريد — الردّ يُرسل يدويًا من بريد الجمعية،
   وهذا مذكور صريحًا في الواجهة بدل إيهام المستخدم بزرّ «ردّ».
   ============================================================================ */
(function () {
  'use strict';

  var U = IAQ.ui, F = IAQ.fmt, A = IAQ.api;
  var KEY = 'submissions';
  var LIMIT = 200;

  /* ------------------------------ خرائط العرض ------------------------------ */
  /* newsletter مسموح في schema-v2.sql ويُرسله زرّ النشرة في تذييل الموقع، فلا نُخفيه */
  var KIND = { 'contact': 'تواصل', 'volunteer': 'تطوّع', 'membership': 'عضوية', 'jobs': 'وظائف', 'newsletter': 'اشتراك نشرة' };
  var KIND_CLS = { 'contact': 't-تواصل', 'volunteer': 't-تطوّع', 'membership': 't-عضوية', 'jobs': 't-توظيف' };
  var KIND_ORDER = ['contact', 'volunteer', 'membership', 'jobs', 'newsletter'];

  var ST = { 'new': 'جديد', 'in_progress': 'قيد المعالجة', 'closed': 'مُغلق', 'archived': 'مؤرشف' };
  var ST_CLS = { 'new': 'nw', 'in_progress': 'pr', 'closed': 'rp', 'archived': 'cl' };
  var ST_ORDER = ['new', 'in_progress', 'closed', 'archived'];

  var PR = { 'low': 'منخفضة', 'normal': 'عادية', 'high': 'عالية' };
  var PR_ORDER = ['low', 'normal', 'high'];

  /* مفاتيح الحمولة كما ترسلها نماذج الموقع فعلًا: التذييل يبني الحمولة من نصّ
     الـlabel العربي (labelOf في footer.html)، لا من اسم الحقل الإنجليزي.
     نُبقي البدائل الإنجليزية أيضًا إن وصل طلب من مصدر آخر. */
  var K_WHO = ['الاسم الكامل', 'الاسم', 'البريد الإلكتروني', 'البريد', 'name', 'full_name', 'email'];
  var K_MSG = ['الرسالة', 'نبذة عنك ومهاراتك', 'نبذة عنك', 'رسالة تعريفية', 'الموضوع',
               'message', 'notes', 'comment', 'details'];

  var IC_EYE = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>';
  var IC_DEL = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';

  /* حالة المُرشِّحات وذاكرة الصفوف المعروضة (اللوح الجانبي يقرأ منها بلا طلب جديد) */
  var fSt = 'all', fKind = 'all', cache = {};

  /* ------------------------------ أدوات صغيرة ------------------------------ */
  function esc(s) { return U.esc(s); }

  function kv(k, v) {
    return '<div class="kv"><span>' + esc(k) + '</span><b style="word-break:break-word">' + esc(v) + '</b></div>';
  }

  /* مفتاح مملوك فعلًا — بدون هذا الفحص يُرجع مثل ST_CLS['constructor'] دالةً من
     سلسلة النماذج (prototype) فتُحقن في سمة class بلا تهذيب */
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function stLabel(s) { return own(ST, s) ? ST[s] : (s ? String(s) : '—'); }
  function stCls(s) { return own(ST_CLS, s) ? ST_CLS[s] : 'cl'; }
  function prLabel(p) { return own(PR, p) ? PR[p] : (p ? String(p) : '—'); }
  function kindLabel(k) { return own(KIND, k) ? KIND[k] : (k ? String(k) : '—'); }
  function kindCls(k) { return own(KIND_CLS, k) ? ' ' + KIND_CLS[k] : ''; }

  /* أوّل مفتاح موجود فعلًا — لا نفترض أن أيّ حقل موجود في الحمولة */
  function firstOf(p, names) {
    if (!p || typeof p !== 'object') return '';
    for (var i = 0; i < names.length; i++) {
      if (!own(p, names[i])) continue;
      var v = p[names[i]];
      if (v != null && typeof v !== 'object' && String(v).length) return String(v);
    }
    return '';
  }

  /* آخر ملاذ للملخّص: أوّل قيمة نصّية فعلية في الحمولة — قيمة حقيقية لا تخمين */
  function firstAny(p) {
    if (!p || typeof p !== 'object') return '';
    var ks = Object.keys(p);
    for (var i = 0; i < ks.length; i++) {
      var v = p[ks[i]];
      if (v != null && typeof v !== 'object' && String(v).length) return String(v);
    }
    return '';
  }

  /* تحويل الحمولة إلى أزواج (مفتاح، قيمة) نصّية — أيّ شكل كان */
  function pairs(p) {
    var out = [];
    if (p == null) return out;
    if (typeof p !== 'object') { out.push(['القيمة', String(p)]); return out; }
    var ks = Object.keys(p);
    for (var i = 0; i < ks.length; i++) {
      var v = p[ks[i]], s;
      if (v == null) s = '';
      else if (typeof v === 'object') { try { s = JSON.stringify(v); } catch (e) { s = String(v); } }
      else s = String(v);
      out.push([ks[i], s]);
    }
    return out;
  }

  /* خيارات القائمة — نُبقي أيّ قيمة غير معروفة كي لا يُغيّرها الحفظ بصمت */
  function opts(map, order, cur) {
    var h = '', seen = false, i, k;
    for (i = 0; i < order.length; i++) {
      k = order[i];
      if (k === cur) seen = true;
      h += '<option value="' + esc(k) + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>';
    }
    if (cur && !seen) {
      h = '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (قيمة غير معروفة)</option>' + h;
    }
    return h;
  }

  function filterBar(act, cur, items) {
    var h = '<div class="filterbar">';
    for (var i = 0; i < items.length; i++) {
      h += '<button class="btn sm ' + (items[i][0] === cur ? 'ok' : 'ghost') +
        '" data-act="' + esc(act) + '" data-arg="' + esc(items[i][0]) + '">' + esc(items[i][1]) + '</button>';
    }
    return h + '</div>';
  }

  function kindItems() {
    var a = [['all', 'كل الأنواع']];
    for (var i = 0; i < KIND_ORDER.length; i++) a.push([KIND_ORDER[i], KIND[KIND_ORDER[i]]]);
    return a;
  }
  function stItems() {
    var a = [['all', 'كل الحالات']];
    for (var i = 0; i < ST_ORDER.length; i++) a.push([ST_ORDER[i], ST[ST_ORDER[i]]]);
    return a;
  }

  /* -------------------------------- الرسم -------------------------------- */
  function paint(mount, rows, counts) {
    cache = {};

    var chips = '<div class="sum-chips">';
    for (var c = 0; c < ST_ORDER.length; c++) {
      chips += '<div class="sum-chip ' + ST_CLS[ST_ORDER[c]] + '"><span class="scv">' +
        esc(F.num(counts[c])) + '</span><span class="scl">' + esc(ST[ST_ORDER[c]]) + '</span></div>';
    }
    chips += '</div>';

    var body = '';
    if (!rows.length) {
      body = U.empty('لا توجد بيانات') +
        '<p class="small muted" style="text-align:center">إن كنت تتوقّع وجود طلبات فقد لا تسمح صلاحيتك بقراءتها؛ ' +
        'قاعدة البيانات تُعيد قائمة فارغة في الحالتين بلا رسالة خطأ.</p>';
    } else {
      var cols = ['التاريخ', 'النوع', 'مُلخّص', 'الحالة', 'الأولوية', 'إجراءات'];
      var h = '<div style="overflow-x:auto"><table class="tbl subs-tbl"><thead><tr>';
      for (var i = 0; i < cols.length; i++) h += '<th>' + esc(cols[i]) + '</th>';
      h += '</tr></thead><tbody>';

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        cache[String(row.id)] = row;

        var p = row.payload;
        var who = firstOf(p, K_WHO) || firstAny(p);
        var msg = firstOf(p, K_MSG);
        var sum = '';
        if (who) sum += '<b>' + esc(F.cut(who, 42)) + '</b>';
        if (msg) sum += (sum ? '<br>' : '') + '<span class="small muted">' + esc(F.cut(msg, 64)) + '</span>';
        if (!sum) sum = '<span class="small muted">لا يوجد ملخّص في الحمولة</span>';

        h += '<tr data-act="subsOpen" data-id="' + esc(row.id) + '">' +
          '<td><span class="small">' + esc(F.date(row.created_at)) + '</span></td>' +
          '<td><span class="tchip' + kindCls(row.kind) + '">' +
          esc(kindLabel(row.kind)) + '</span></td>' +
          '<td>' + sum + '</td>' +
          '<td><span class="stbadge ' + stCls(row.status) + '">' + esc(stLabel(row.status)) + '</span></td>' +
          '<td><span class="pri' + (row.priority === 'high' ? ' hi' : '') + '">' + esc(prLabel(row.priority)) + '</span></td>' +
          '<td>' +
          U.iconBtn('subsOpen', IC_EYE, { id: row.id, sm: true, label: 'عرض التفاصيل' }) + ' ' +
          U.iconBtn('subsDel', IC_DEL, { id: row.id, sm: true, danger: true, label: 'حذف الطلب' }) +
          '</td></tr>';
      }
      body = h + '</tbody></table></div>';
      if (rows.length >= LIMIT) {
        body += U.notice('يُعرض أحدث ' + esc(F.num(LIMIT)) + ' سجلّ فقط ضمن هذا المُرشِّح؛ استخدم المُرشِّحات للوصول إلى الأقدم.');
      }
    }

    mount.innerHTML =
      U.head('الطلبات والرسائل', 'الوارد من نماذج الموقع — ' + F.num(counts[0]) + ' طلبًا جديدًا') +
      U.notice('<b>هذه الشاشة تقرأ جدول <span class="mono">submissions</span> في قاعدة البيانات فقط.</b><br>' +
        'لا تُرسل اللوحة بريدًا إلكترونيًا: الردّ على أي طلب يُكتب ويُرسل يدويًا من بريد الجمعية، ثم تُحدَّث الحالة هنا لتسجيل ما تمّ. ' +
        'نماذج الموقع العامّ تُدرج صفوفها في هذا الجدول لحظة الإرسال، وتغيير الحالة أو الأولوية هنا لا يظهر للزوّار ' +
        'لأن الموقع العامّ لا يعرض الطلبات إطلاقًا — فلا حاجة لإعادة بناء الموقع بعد أيّ تعديل في هذه الشاشة.') +
      chips +
      '<p class="small muted">الأعداد أعلاه محسوبة من قاعدة البيانات ضمن مُرشِّح النوع الحالي.</p>' +
      filterBar('subsSt', fSt, stItems()) +
      filterBar('subsKind', fKind, kindItems()) +
      U.card('السجلّات (' + F.num(rows.length) + ')', body);
  }

  function render(mount) {
    var kf = fKind === 'all' ? '' : '&kind=eq.' + encodeURIComponent(fKind);
    var q = 'select=*&order=created_at.desc&limit=' + LIMIT + kf;
    if (fSt !== 'all') q += '&status=eq.' + encodeURIComponent(fSt);

    var jobs = [A.select('submissions', q)];
    for (var i = 0; i < ST_ORDER.length; i++) {
      jobs.push(A.count('submissions', 'select=id&status=eq.' + ST_ORDER[i] + kf));
    }

    return Promise.all(jobs).then(function (res) {
      paint(mount, res[0] || [], [res[1], res[2], res[3], res[4]]);
    }).catch(function (e) {
      mount.innerHTML = U.head('الطلبات والرسائل') +
        U.notice('<b>تعذّر تحميل الطلبات.</b><br>' + esc(e && e.message ? e.message : e));
      U.toast((e && e.message) || 'فشل الإجراء', 'err');
    });
  }

  /* ------------------------------ اللوح الجانبي ------------------------------ */
  IAQ.on('subsOpen', function (btn) {
    var id = btn.getAttribute('data-id');
    var row = cache[String(id)];
    if (!row) { U.toast('تعذّر العثور على السجلّ، يُعاد التحميل', 'warn'); IAQ.go(KEY); return; }

    var p = row.payload;

    var meta = '<div class="sub-meta">' +
      kv('رقم الطلب', '#' + row.id) +
      kv('النوع', kindLabel(row.kind)) +
      kv('تاريخ الوصول', F.date(row.created_at)) +
      kv('الحالة', stLabel(row.status)) +
      kv('الأولوية', prLabel(row.priority)) +
      '</div>';

    var msg = firstOf(p, K_MSG);
    var msgHtml = '<div class="sub-msg"><div class="sm-label">نصّ الرسالة</div><p' +
      (msg ? '>' + esc(msg).replace(/\r/g, '').replace(/\n/g, '<br>')
           : ' class="muted">لم يُتعرَّف على حقل رسالة بين مفاتيح هذه الحمولة؛ الحقول كما وصلت معروضة بالأسفل.') +
      '</p></div>';

    var ps = pairs(p), form, j;
    if (ps.length) {
      form = '<div class="sub-meta">';
      for (j = 0; j < ps.length; j++) form += kv(ps[j][0], ps[j][1] === '' ? '—' : ps[j][1]);
      form += '</div>';
    } else {
      form = U.empty('الحمولة فارغة أو ليست كائنًا');
    }

    var html = meta + msgHtml +
      '<div class="drawer-sec"><h4>بيانات النموذج كما وصلت</h4>' +
      '<p class="small muted">مُدخَلات زائر غير موثوقة؛ تُعرض كنصّ فقط.</p>' + form + '</div>' +
      '<div class="drawer-sec"><h4>تحديث الحالة والأولوية</h4>' +
      '<div class="cfld"><label for="subs-st-sel">الحالة</label>' +
      '<select class="dsel" id="subs-st-sel">' + opts(ST, ST_ORDER, row.status) + '</select></div>' +
      '<div class="cfld"><label for="subs-pr-sel">الأولوية</label>' +
      '<select class="dsel" id="subs-pr-sel">' + opts(PR, PR_ORDER, row.priority || 'normal') + '</select></div>' +
      '<div class="btnbar">' +
      U.iconBtn('subsDel', IC_DEL, { id: row.id, danger: true, label: 'حذف الطلب' }) +
      '<button class="btn ok" data-act="subsSave" data-id="' + esc(row.id) + '">حفظ التغييرات</button>' +
      '</div></div>' +
      '<div class="drawer-sec"><h4>الردّ على المُرسِل</h4>' +
      U.notice('لا توجد في اللوحة قدرة إرسال بريد إلكتروني. اكتب الردّ وأرسله يدويًا من بريد الجمعية، ' +
        'ثم غيّر الحالة هنا إلى «قيد المعالجة» أو «مُغلق» لتوثيق ما تمّ.') +
      '</div>';

    U.drawer('طلب رقم ' + row.id + ' · ' + kindLabel(row.kind), html);
  });

  /* -------------------------------- الحفظ -------------------------------- */
  IAQ.on('subsSave', function (btn) {
    var id = btn.getAttribute('data-id');
    var sEl = U.$('#subs-st-sel'), pEl = U.$('#subs-pr-sel');
    if (!sEl || !pEl) { U.toast('حقول التحديث غير متاحة', 'err'); return; }
    var patch = { status: sEl.value, priority: pEl.value };
    btn.disabled = true;

    A.update('submissions', id, patch).then(function (rows) {
      if (!rows || !rows.length) {
        // 200 ومصفوفة فارغة = لم يُطابق أيّ صفّ سياسة الكتابة — لا نُعلن نجاحًا
        U.toast('لم يُحدَّث أيّ سجلّ — قد لا تملك صلاحية التعديل', 'warn');
        return null;
      }
      return IAQ.audit('submission.status', 'submissions', id).then(function () {
        U.toast('تم الحفظ');
        U.closeDrawer();
        IAQ.go(KEY);
      });
    }).catch(function (e) {
      U.toast((e && e.message) || 'فشل الإجراء', 'err');
    }).then(function () {
      try { btn.disabled = false; } catch (e2) { }
    });
  });

  /* -------------------------------- الحذف -------------------------------- */
  IAQ.on('subsDel', function (btn) {
    var id = btn.getAttribute('data-id');
    var row = cache[String(id)];
    var who = row ? firstOf(row.payload, ['name', 'full_name', 'email']) : '';

    U.ask('حذف الطلب رقم ' + id + (who ? ' («' + F.cut(who, 40) + '»)' : '') +
      ' نهائيًا من قاعدة البيانات؟ لا يمكن التراجع.', 'حذف نهائي').then(function (ok) {
        if (!ok) return null;
        return A.remove('submissions', id).then(function (rows) {
          if (!rows || !rows.length) {
            U.toast('لم يُحذف أيّ سجلّ — قد لا تملك صلاحية الحذف', 'warn');
            return null;
          }
          return IAQ.audit('submission.delete', 'submissions', id).then(function () {
            U.toast('تم الحذف');
            U.closeDrawer();
            IAQ.go(KEY);
          });
        });
      }).catch(function (e) {
        U.toast((e && e.message) || 'فشل الإجراء', 'err');
      });
  });

  /* ------------------------------ المُرشِّحات ------------------------------ */
  IAQ.on('subsSt', function (btn) { fSt = btn.getAttribute('data-arg') || 'all'; IAQ.go(KEY); });
  IAQ.on('subsKind', function (btn) { fKind = btn.getAttribute('data-arg') || 'all'; IAQ.go(KEY); });

  IAQ.views.register(KEY, {
    label: 'الطلبات والرسائل',
    group: 'التفاعل',
    icon: '<path d="M6 4h12l3 9v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l3-9z"/><path d="M3 13h5l2 3h4l2-3h5"/>',
    render: render
  });
})();
