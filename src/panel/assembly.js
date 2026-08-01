/* ============================================================================
   شاشة أعضاء الجمعية العمومية — وحدة مستقلّة تمامًا.

   تقرأ وتكتب في public.people حيث grp='assembly'.
   نوع العضوية = العمود cat:  founder = عضو مؤسس   |   working = عضو عامل

   قالب الإكسل يُبنى هنا بلا أي مكتبة خارجية: ملف xlsx حقيقي (حزمة مضغوطة
   بلا ضغط) فيه قائمة منسدلة فعلية على عمود نوع العضوية. والقراءة تفكّ الضغط
   بـ DecompressionStream المتوفّر في المتصفّحات الحديثة، ويُقبل CSV بديلًا.
   ============================================================================ */
window.IAQ_ASSEMBLY = (function () {
  'use strict';

  var CFG = window.IAQ_SUPABASE || { url: '', key: '' };
  var S = window.IAQ_SESSION || null;
  var CAT = { founder: 'عضو مؤسس', working: 'عضو عامل' };
  var ST = { published: 'ظاهر', hidden: 'مخفي', draft: 'مسودّة' };

  var rows = [], q = '', err = null, busy = false, staged = null;
  var BUILD = window.IAQ_BUILD || '—';

  /* ------------------------------- أدوات ------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(s) { return document.querySelector(s); }
  function hdr(json) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + (S ? S.access_token : '') };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function fail(r) {
    return r.text().then(function (b) {
      var d = '';
      try { var j = JSON.parse(b); d = j.message || j.hint || ''; } catch (e) { d = String(b).slice(0, 160); }
      throw new Error('(' + r.status + ') ' + (d || 'فشل الطلب'));
    });
  }
  function api(path, opt) {
    opt = opt || {};
    opt.headers = hdr(!!opt.body);
    return fetch(CFG.url + '/rest/v1/' + path, opt).then(function (r) {
      if (!r.ok) return fail(r);
      if (r.status === 204) return null;
      return r.json();
    });
  }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /* ------------------------------ القراءة ------------------------------ */
  function load() {
    err = null;
    return api('people?select=id,title,name,cat,sort,status&grp=eq.assembly&order=sort.asc,id.asc&limit=500')
      .then(function (r) { rows = r || []; })
      .catch(function (e) { rows = []; err = e.message; });
  }

  /* ------------------------------- العرض ------------------------------- */
  function view() {
    setTimeout(function () { load().then(paint); }, 0);
    /* الأزرار والبحث في الهيكل الثابت لا في دالّة الرسم: لو تعذّرت القراءة
       تبقى الشاشة صالحة للاستخدام ويظهر سبب التعذّر، لا صفحة فارغة. */
    return '<div class="view-head"><h1>أعضاء الجمعية العمومية ' +
      '<span class="chip" style="vertical-align:middle;font-size:11px">إصدار ' + esc(BUILD) + '</span></h1>' +
      '<p>بيانات الأعضاء الحاليين — تعديل وحذف وإضافة، فرديًّا أو دفعةً من ملف إكسل.</p></div>' +
      '<div class="ad-card" style="margin-block-end:14px">' + toolbar() +
        '<div id="am-diag" class="muted small">جارٍ تحميل الأعضاء…</div></div>' +
      '<div id="am-err"></div>' +
      '<div id="am-stats"></div>' +
      '<div class="ad-card">' +
        '<div id="am-list"></div>' +
        '<p class="muted small" style="margin-block-start:12px">التعديل والحذف والإضافة تسري على صفحة ' +
        '«الجمعية العمومية» في الموقع عند أوّل تحميل لها، بلا إعادة بناء.</p>' +
      '</div>';
  }

  function toolbar() {
    return '<div class="addrow" style="margin-block-end:14px">' +
      '<input id="am-q" type="text" value="' + esc(q) + '" placeholder="بحث بالاسم…" style="flex:2;min-width:170px">' +
      '<button class="btn ghost" data-am="search">بحث</button>' +
      '<button class="btn" data-am="add">' + ico('plus') + ' إضافة عضو</button>' +
      '<button class="btn ghost" data-am="import">' + ico('up') + ' إضافة من إكسل</button>' +
      '<button class="btn ghost" data-am="tpl">' + ico('down') + ' تنزيل القالب</button>' +
      '<button class="btn ghost" data-am="reload">تحديث</button>' +
      '</div>';
  }
  function card(inner) { return '<div class="ad-card">' + inner + '</div>'; }

  function counts() {
    var f = 0, w = 0, h = 0;
    rows.forEach(function (r) {
      if (r.cat === 'founder') f++; else if (r.cat === 'working') w++;
      if (r.status !== 'published') h++;
    });
    return { f: f, w: w, h: h };
  }

  function paint() {
    var st = $('#am-stats'), ls = $('#am-list'), ep = $('#am-err');
    if (!ls) return;
    var c = counts();
    var list = rows.filter(function (r) {
      if (!q) return true;
      return (norm(r.name) + ' ' + norm(r.title)).toLowerCase().indexOf(q.toLowerCase()) > -1;
    });

    if (st) st.innerHTML =
      '<div class="stat-grid" style="grid-template-columns:repeat(4,1fr);margin-block-end:16px">' +
        box(rows.length, 'إجمالي الأعضاء') +
        box(c.f, CAT.founder) +
        box(c.w, CAT.working) +
        box(c.h, 'غير ظاهر على الموقع') +
      '</div>';
    if (ep) ep.innerHTML = err
      ? '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
        '<b>تعذّر تنفيذ الإجراء</b><br>' + esc(err) + '</div>' : '';

    var body = list.length ? list.map(function (r, i) {
      return '<tr>' +
        '<td class="mono small">' + (i + 1) + '</td>' +
        '<td><b>' + esc(((r.title || '') + ' ' + r.name).trim()) + '</b></td>' +
        '<td>' + chip(r.cat) + '</td>' +
        '<td>' + (r.status === 'published' ? '<span class="chip">ظاهر</span>'
                : '<span class="chip" style="background:#f4e9d4;color:#7a5518">' + esc(ST[r.status] || r.status) + '</span>') + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="ib sm" data-am="edit" data-id="' + r.id + '" title="تعديل" aria-label="تعديل">' + ico('pen') + '</button> ' +
          '<button class="ib sm danger" data-am="del" data-id="' + r.id + '" title="حذف" aria-label="حذف">' + ico('trash') + '</button>' +
        '</td></tr>';
    }).join('') : '';

    var table = list.length
      ? '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>الاسم</th>' +
        '<th>نوع العضوية</th><th>الحالة</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>'
      : '<div class="muted" style="padding:28px;text-align:center">' +
        (rows.length ? 'لا نتائج مطابقة للبحث.' : 'لا أعضاء بعد — أضِف عضوًا أو استورد ملف إكسل.') + '</div>';

    ls.innerHTML = table;
    var qi = $('#am-q');
    if (qi && qi.value !== q) qi.value = q;

    /* سطر تشخيص ظاهر: يقول ما قُرئ وما وُجد في الصفحة فعلًا. وُضع لأن تشخيص
       «لا يظهر شيء» من صورة شاشة وحدها أثبت أنه غير كافٍ. */
    var dg = $('#am-diag');
    if (dg) {
      var card = ls.parentNode, cb = card ? card.getBoundingClientRect() : null;
      dg.innerHTML = 'قُرئ <b>' + rows.length + '</b> عضوًا · معروض <b>' + list.length + '</b>' +
        ' · صفوف الجدول في الصفحة: <b>' + (ls.querySelectorAll('tbody tr').length) + '</b>' +
        ' · ارتفاع منطقة الجدول: <b>' + (cb ? Math.round(cb.height) : '؟') + 'px</b>' +
        ' · إصدار ' + esc(BUILD);
    }
  }
  function box(n, label) {
    return '<div class="stat-box"><div class="sb-val">' + esc(String(n)) + '</div>' +
           '<div class="sb-label">' + esc(label) + '</div></div>';
  }
  function chip(cat) {
    var gold = cat === 'founder';
    return '<span class="chip"' + (gold ? ' style="background:#f8efdb;color:#7a5518"' : '') + '>' +
      esc(CAT[cat] || '—') + '</span>';
  }
  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    up: '<path d="M12 20V6M6 12l6-6 6 6"/><path d="M4 20h16"/>',
    down: '<path d="M12 4v14M6 12l6 6 6-6"/><path d="M4 20h16"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function ico(k) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[k] || '') + '</svg>';
  }

  /* ---------------------------- نافذة منبثقة ---------------------------- */
  function modal(title, bodyHtml, footHtml) {
    close();
    var ov = document.createElement('div');
    ov.id = 'am-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(4,52,44,.46);z-index:600;display:flex;' +
      'align-items:center;justify-content:center;padding:20px;direction:rtl';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-label="' + esc(title) + '" style="background:#fff;border-radius:16px;' +
        'max-width:640px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 30px 70px -20px rgba(6,63,54,.5)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 22px;' +
          'border-block-end:1px solid var(--line)">' +
          '<b style="font-family:var(--disp);font-size:1.12rem;color:var(--ink)">' + esc(title) + '</b>' +
          '<button class="ib sm" data-am="close" aria-label="إغلاق">' + ico('x') + '</button></div>' +
        '<div style="padding:20px 22px">' + bodyHtml + '</div>' +
        (footHtml ? '<div class="btnbar" style="padding:0 22px 20px">' + footHtml + '</div>' : '') +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    var f = ov.querySelector('input,select,textarea');
    if (f) f.focus();
    return ov;
  }
  function close() {
    var m = document.getElementById('am-modal');
    if (m) m.remove();
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  function field(id, label, val, hint) {
    return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input type="text" id="' + id + '" value="' + esc(val || '') + '">' +
      (hint ? '<div class="muted small" style="margin-block-start:4px">' + esc(hint) + '</div>' : '') + '</div>';
  }
  function catSelect(id, val) {
    return '<div class="fld"><label for="' + id + '">نوع العضوية</label><select id="' + id + '">' +
      '<option value="founder"' + (val === 'founder' ? ' selected' : '') + '>' + CAT.founder + '</option>' +
      '<option value="working"' + (val === 'working' ? ' selected' : '') + '>' + CAT.working + '</option>' +
      '</select></div>';
  }

  function openForm(row) {
    var isNew = !row;
    row = row || { title: '', name: '', cat: 'founder', status: 'published' };
    modal(isNew ? 'إضافة عضو جديد' : 'تعديل بيانات العضو',
      '<div class="grid2">' +
        field('am-title', 'اللقب (اختياري)', row.title, 'مثل: أ. أو د. أو م.') +
        '<div></div>' +
      '</div>' +
      field('am-name', 'اسم العضو *', row.name) +
      catSelect('am-cat', row.cat) +
      '<div class="fld"><label for="am-status">الحالة</label><select id="am-status">' +
        '<option value="published"' + (row.status === 'published' ? ' selected' : '') + '>ظاهر على الموقع</option>' +
        '<option value="hidden"' + (row.status === 'hidden' ? ' selected' : '') + '>مخفي</option>' +
      '</select></div>' +
      '<div id="am-formerr" class="muted small" style="color:#8c3d1c"></div>',
      '<button class="btn ghost" data-am="close">إلغاء</button>' +
      '<button class="btn" data-am="save" data-id="' + (row.id || '') + '">' +
        (isNew ? 'إضافة العضو' : 'حفظ التعديل') + '</button>');
  }

  function saveForm(id) {
    var name = norm(($('#am-name') || {}).value);
    var e = $('#am-formerr');
    if (!name) { if (e) e.textContent = 'اسم العضو مطلوب.'; return; }
    var rec = { title: norm(($('#am-title') || {}).value), name: name,
                cat: ($('#am-cat') || {}).value, status: ($('#am-status') || {}).value,
                grp: 'assembly', updated_by: (S && S.email) || '' };
    if (busy) return;
    busy = true;
    var p;
    if (id) {
      p = api('people?id=eq.' + Number(id) + '&select=id',
              { method: 'PATCH', body: JSON.stringify(rec) });
    } else {
      var mx = 0;
      rows.forEach(function (r) { if (r.sort > mx) mx = r.sort; });
      rec.sort = mx + 10;
      p = api('people?select=id', { method: 'POST', body: JSON.stringify([rec]) });
    }
    p.then(function (out) {
      if (!out || !out.length) throw new Error('لم يتغيّر أي صفّ — تحقّق من صلاحية حسابك.');
      close();
      return load().then(paint);
    }).catch(function (ex) {
      var el = $('#am-formerr');
      if (el) el.textContent = ex.message;
      else { err = ex.message; paint(); }
    }).then(function () { busy = false; });
  }

  function askDelete(id) {
    var r = null;
    rows.forEach(function (x) { if (String(x.id) === String(id)) r = x; });
    if (!r) return;
    modal('تأكيد الحذف',
      '<p>حذف العضو <b>' + esc(((r.title || '') + ' ' + r.name).trim()) + '</b> نهائيًّا من قاعدة البيانات؟</p>' +
      '<p class="muted small">سيُرفع من صفحة الجمعية العمومية عند أوّل تحميل لها. ' +
      'وإن أردت إبقاءه في السجلّ وإخفاءه فقط فاستخدم «تعديل» واختر «مخفي».</p>',
      '<button class="btn ghost" data-am="close">إلغاء</button>' +
      '<button class="btn danger" data-am="delyes" data-id="' + r.id + '">حذف نهائي</button>');
  }
  function doDelete(id) {
    if (busy) return;
    busy = true;
    api('people?id=eq.' + Number(id) + '&select=id', { method: 'DELETE' })
      .then(function (out) {
        if (!out || !out.length) throw new Error('لم يُحذف شيء — قد يكون محذوفًا أو لا تسمح الصلاحية.');
        close();
        return load().then(paint);
      })
      .catch(function (ex) { err = ex.message; close(); paint(); })
      .then(function () { busy = false; });
  }

  /* ============================ قالب الإكسل ============================
     نبني ملف xlsx بأنفسنا: حزمة ZIP مخزَّنة بلا ضغط، فلا نحتاج أي مكتبة،
     ونضع تحقّقًا من صحّة البيانات على عمود نوع العضوية فيصير قائمة منسدلة. */
  var CRC = null;
  function crcTable() {
    if (CRC) return CRC;
    CRC = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC[n] = c >>> 0;
    }
    return CRC;
  }
  function crc32(bytes) {
    var t = crcTable(), c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(str) { return new TextEncoder().encode(str); }
  function u16(v) { return [v & 255, (v >> 8) & 255]; }
  function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }

  function zip(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var nameB = utf8(f.name), data = f.data, c = crc32(data);
      var lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                         u32(c), u32(data.length), u32(data.length), u16(nameB.length), u16(0));
      chunks.push(new Uint8Array(lh), nameB, data);
      central.push({ name: nameB, crc: c, size: data.length, off: offset });
      offset += lh.length + nameB.length + data.length;
    });
    var cdStart = offset, cd = [];
    central.forEach(function (e) {
      var h = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
                        u32(e.crc), u32(e.size), u32(e.size), u16(e.name.length),
                        u16(0), u16(0), u16(0), u16(0), u32(0), u32(e.off));
      cd.push(new Uint8Array(h), e.name);
      offset += h.length + e.name.length;
    });
    var eocd = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0),
                              u16(central.length), u16(central.length),
                              u32(offset - cdStart), u32(cdStart), u16(0)));
    return new Blob(chunks.concat(cd, [eocd]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function cellInline(ref, text) {
    return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
      esc(text).replace(/'/g, '&#39;') + '</t></is></c>';
  }
  function templateBlob() {
    var rowsXml = '<row r="1"><c r="A1" t="inlineStr" s="1"><is><t>اسم العضو</t></is></c>' +
                  '<c r="B1" t="inlineStr" s="1"><is><t>نوع العضوية</t></is></c></row>';
    /* ثلاثة أسطر أمثلة كي يتضح المطلوب */
    var ex = [['محمد عبدالله السالم', CAT.founder], ['نورة صالح العتيبي', CAT.working], ['', '']];
    for (var i = 0; i < ex.length; i++) {
      var r = i + 2;
      rowsXml += '<row r="' + r + '">' + cellInline('A' + r, ex[i][0]) + cellInline('B' + r, ex[i][1]) + '</row>';
    }
    var sheet =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews>' +
      '<cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/></cols>' +
      '<sheetData>' + rowsXml + '</sheetData>' +
      '<dataValidations count="1">' +
        '<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"' +
        ' errorTitle="قيمة غير مقبولة" error="اختر: عضو مؤسس أو عضو عامل"' +
        ' promptTitle="نوع العضوية" prompt="اختر من القائمة" sqref="B2:B1000">' +
        '<formula1>"' + CAT.founder + ',' + CAT.working + '"</formula1>' +
      '</dataValidation></dataValidations>' +
      '</worksheet>';
    var styles =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FF0F2A2A"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF4F3"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border/></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
      '</styleSheet>';
    var files = [
      { name: '[Content_Types].xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>') },
      { name: '_rels/.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>') },
      { name: 'xl/workbook.xml', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"' +
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="الأعضاء" sheetId="1" r:id="rId1"/></sheets></workbook>') },
      { name: 'xl/_rels/workbook.xml.rels', data: utf8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>') },
      { name: 'xl/styles.xml', data: utf8(styles) },
      { name: 'xl/worksheets/sheet1.xml', data: utf8(sheet) }
    ];
    return zip(files);
  }
  function downloadTemplate() {
    var url = URL.createObjectURL(templateBlob());
    var a = document.createElement('a');
    a.href = url;
    a.download = 'قالب-أعضاء-الجمعية-العمومية.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  /* ============================ قراءة الملفات ============================ */
  function readZipEntries(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    /* نبحث عن نهاية الفهرس المركزي من آخر الملف */
    var eocd = -1;
    for (var i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('الملف ليس حزمة إكسل صحيحة.');
    var n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    var out = [], p = cdOff;
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var cmtLen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      var lNameLen = dv.getUint16(lho + 26, true), lExtra = dv.getUint16(lho + 28, true);
      var start = lho + 30 + lNameLen + lExtra;
      out.push({ name: name, method: method, bytes: u8.subarray(start, start + csize) });
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return out;
  }
  function inflate(entry) {
    if (entry.method === 0) return Promise.resolve(new TextDecoder().decode(entry.bytes));
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('متصفّحك لا يدعم فكّ ضغط الإكسل. احفظ الملف بصيغة CSV وأعد المحاولة.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var blob = new Blob([entry.bytes]);
    return new Response(blob.stream().pipeThrough(ds)).text();
  }
  function colOf(ref) {
    var m = /^([A-Z]+)/.exec(ref || '');
    if (!m) return 0;
    var s = m[1], v = 0;
    for (var i = 0; i < s.length; i++) v = v * 26 + (s.charCodeAt(i) - 64);
    return v;
  }
  function parseXlsx(buf) {
    var entries = readZipEntries(buf), sheet = null, shared = null;
    entries.forEach(function (e) {
      if (/^xl\/worksheets\/sheet1\.xml$/i.test(e.name)) sheet = e;
      if (/^xl\/sharedStrings\.xml$/i.test(e.name)) shared = e;
    });
    if (!sheet) throw new Error('لم أجد ورقة العمل الأولى في الملف.');
    return Promise.all([inflate(sheet), shared ? inflate(shared) : Promise.resolve(null)])
      .then(function (r) {
        var sxml = r[0], sst = [];
        if (r[1]) {
          var re = /<si>([\s\S]*?)<\/si>/g, m;
          while ((m = re.exec(r[1]))) {
            var txt = '';
            var tre = /<t[^>]*>([\s\S]*?)<\/t>/g, tm;
            while ((tm = tre.exec(m[1]))) txt += tm[1];
            sst.push(unesc(txt));
          }
        }
        var out = [];
        var rre = /<row[^>]*>([\s\S]*?)<\/row>/g, rm;
        while ((rm = rre.exec(sxml))) {
          var cells = {}, cre = /<c([^>]*)>([\s\S]*?)<\/c>|<c([^>]*)\/>/g, cm;
          while ((cm = cre.exec(rm[1]))) {
            var attrs = cm[1] || cm[3] || '', inner = cm[2] || '';
            var ref = (/r="([A-Z]+\d+)"/.exec(attrs) || [])[1] || '';
            var ty = (/t="([a-zA-Z]+)"/.exec(attrs) || [])[1] || 'n';
            var val = '';
            if (ty === 's') {
              var iv = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
              val = sst[parseInt(iv, 10)] || '';
            } else if (ty === 'inlineStr') {
              var t2 = '';
              var tre2 = /<t[^>]*>([\s\S]*?)<\/t>/g, tm2;
              while ((tm2 = tre2.exec(inner))) t2 += tm2[1];
              val = unesc(t2);
            } else {
              val = unesc((/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1] || '');
            }
            cells[colOf(ref)] = val;
          }
          out.push([cells[1] || '', cells[2] || '']);
        }
        return out;
      });
  }
  function unesc(s) {
    return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function parseCsv(text) {
    var lines = String(text).replace(/\r/g, '').split('\n'), out = [];
    lines.forEach(function (ln) {
      if (!ln.trim()) return;
      var cells = [], cur = '', inQ = false;
      for (var i = 0; i < ln.length; i++) {
        var ch = ln[i];
        if (ch === '"') { if (inQ && ln[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if ((ch === ',' || ch === ';') && !inQ) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      out.push([norm(cells[0]), norm(cells[1])]);
    });
    return out;
  }

  /* ---------------------------- نافذة الاستيراد ---------------------------- */
  function openImport() {
    staged = null;
    modal('إضافة أعضاء من ملف إكسل',
      '<p class="muted small" style="margin-block-end:14px">نزّل القالب أولًا، واكتب في العمود الأول ' +
      '<b>اسم العضو</b> وفي الثاني <b>نوع العضوية</b> من القائمة المنسدلة، ثم ارفع الملف هنا. ' +
      'تُقبل صيغة xlsx و CSV.</p>' +
      '<div class="btnbar" style="justify-content:flex-start;margin-block-end:14px">' +
        '<button class="btn ghost" data-am="tpl">' + ico('down') + ' تنزيل القالب</button></div>' +
      '<label class="upload big" for="am-file">' + ico('up') + ' اختر الملف' +
        '<input type="file" id="am-file" accept=".xlsx,.csv,text/csv" hidden></label>' +
      '<div id="am-preview" style="margin-block-start:16px"></div>',
      '<button class="btn ghost" data-am="close">إلغاء</button>' +
      '<button class="btn" data-am="importgo" disabled id="am-go">إضافة الأعضاء</button>');
    var inp = $('#am-file');
    if (inp) inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (f) handleFile(f);
    });
  }

  function handleFile(file) {
    var pv = $('#am-preview');
    if (pv) pv.innerHTML = '<div class="muted">جارٍ قراءة الملف…</div>';
    var isCsv = /\.csv$/i.test(file.name);
    var p = isCsv ? file.text().then(parseCsv)
                  : file.arrayBuffer().then(parseXlsx);
    p.then(function (raw) { showPreview(raw); })
     .catch(function (e) {
       if (pv) pv.innerHTML = '<div class="notice" style="background:#fdf1ec;border-color:#f0cdbc;color:#8c3d1c">' +
         esc(e.message) + '</div>';
     });
  }

  function catFromText(s) {
    var t = norm(s);
    if (!t) return '';
    if (t.indexOf('مؤسس') > -1 || /founder/i.test(t)) return 'founder';
    if (t.indexOf('عامل') > -1 || /working/i.test(t)) return 'working';
    return '';
  }

  function showPreview(raw) {
    var seen = {}, ok = [], bad = [];
    rows.forEach(function (r) { seen[norm(r.name)] = true; });
    raw.forEach(function (r, i) {
      var name = norm(r[0]), cat = catFromText(r[1]);
      if (!name) return;
      if (/اسم العضو/.test(name)) return;               // سطر العنوان
      if (!cat) { bad.push({ i: i + 1, name: name, why: 'نوع العضوية غير مفهوم' }); return; }
      if (seen[name]) { bad.push({ i: i + 1, name: name, why: 'موجود مسبقًا بالاسم نفسه' }); return; }
      seen[name] = true;
      ok.push({ name: name, cat: cat });
    });
    staged = ok;
    var pv = $('#am-preview');
    if (!pv) return;
    var h = '<div class="stat-grid" style="grid-template-columns:repeat(2,1fr);margin-block-end:12px">' +
      box(ok.length, 'جاهز للإضافة') + box(bad.length, 'سطر متجاوَز') + '</div>';
    if (ok.length) {
      h += '<div style="max-height:220px;overflow:auto"><table class="tbl"><thead><tr><th>#</th><th>الاسم</th>' +
           '<th>نوع العضوية</th></tr></thead><tbody>' +
           ok.map(function (r, i) {
             return '<tr><td class="mono small">' + (i + 1) + '</td><td>' + esc(r.name) + '</td><td>' + chip(r.cat) + '</td></tr>';
           }).join('') + '</tbody></table></div>';
    }
    if (bad.length) {
      h += '<div class="notice" style="margin-block-start:12px"><b>سطور لم تُقبل (' + bad.length + ')</b>' +
           bad.slice(0, 12).map(function (b) {
             return '<div class="small">سطر ' + b.i + ': ' + esc(b.name || '(بلا اسم)') + ' — ' + esc(b.why) + '</div>';
           }).join('') + '</div>';
    }
    if (!ok.length && !bad.length) h += '<div class="muted">لم أجد أي سطر فيه اسم.</div>';
    pv.innerHTML = h;
    var go = $('#am-go');
    if (go) go.disabled = !ok.length;
  }

  function importGo() {
    if (!staged || !staged.length || busy) return;
    busy = true;
    var mx = 0;
    rows.forEach(function (r) { if (r.sort > mx) mx = r.sort; });
    var payload = staged.map(function (r, i) {
      return { grp: 'assembly', title: '', name: r.name, cat: r.cat,
               status: 'published', sort: mx + (i + 1) * 10, updated_by: (S && S.email) || '' };
    });
    var go = $('#am-go');
    if (go) { go.disabled = true; go.textContent = 'جارٍ الإضافة…'; }
    api('people?select=id', { method: 'POST', body: JSON.stringify(payload) })
      .then(function (out) {
        var n = (out || []).length;
        close();
        return load().then(function () {
          paint();
          var ep2 = $('#am-err');
          if (ep2) ep2.innerHTML = '<div class="notice" style="background:#eef4f3;border-color:#d6e5e3;color:#0c6c6c">' +
            '<b>أُضيف ' + n + ' عضوًا.</b> يظهرون في صفحة الجمعية العمومية عند أوّل تحميل لها.</div>';
        });
      })
      .catch(function (e) { err = e.message; close(); paint(); })
      .then(function () { busy = false; });
  }

  /* ------------------------------ الأحداث ------------------------------ */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-am]') : null;
    if (!b) return;
    var a = b.getAttribute('data-am'), id = b.getAttribute('data-id');
    if (a === 'close') { e.preventDefault(); close(); return; }
    if (a === 'tpl') { e.preventDefault(); downloadTemplate(); return; }
    if (a === 'add') { e.preventDefault(); openForm(null); return; }
    if (a === 'import') { e.preventDefault(); openImport(); return; }
    if (a === 'importgo') { e.preventDefault(); importGo(); return; }
    if (a === 'save') { e.preventDefault(); saveForm(id); return; }
    if (a === 'del') { e.preventDefault(); askDelete(id); return; }
    if (a === 'delyes') { e.preventDefault(); doDelete(id); return; }
    if (a === 'reload') { e.preventDefault(); load().then(paint); return; }
    if (a === 'search') {
      e.preventDefault();
      var i2 = $('#am-q');
      q = i2 ? norm(i2.value) : '';
      paint();
      return;
    }
    if (a === 'edit') {
      e.preventDefault();
      var row = null;
      rows.forEach(function (x) { if (String(x.id) === String(id)) row = x; });
      if (row) openForm(row);
    }
  });

  return { view: view, reload: function () { return load().then(paint); } };
})();
