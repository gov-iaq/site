/* ============================================================================
   نواة لوحة التحكّم — الجلسة، طلبات Supabase، مستودع الملفات، واجهة العرض،
   والمُوجّه (router). كل وحدة (module) تسجّل شاشتها عبر IAQ.views.register.

   قواعد مثبَّتة من وثائق Supabase/PostgREST (كل واحدة أُدرجت لأنها تكسر بصمت):
   • كل طلب يحمل الترويستين معًا: apikey (بوابة المشروع) + Authorization (هوية المدير).
     المفتاح وحده = دور anon (المنشور فقط)، والـBearer وحده يُرفض من البوابة.
   • القراءة الممنوعة بـRLS ترجع 200 ومصفوفة فارغة لا 403 — لذلك نتحقّق من
     صلاحية المدير بطلب مستقلّ على جدول admins قبل إظهار الواجهة.
   • الكتابة الممنوعة ترجع 403 (موثَّق) أو 401 إن كان الرمز منتهيًا.
   • PATCH أو DELETE بلا مُرشِّح يُعيد كتابة الجدول كلّه! نتحقّق أن المعرّف عدد
     صحيح موجب قبل بناء الرابط، ونرفض غير ذلك قبل مغادرة المتصفّح.
   • Prefer: return=representation إلزاميّ وإلا فلا نعرف ما حدث (الافتراضي minimal).
   • الترقيم يرجع 206 Partial Content وهو نجاح — نتحقّق من res.ok لا من status===200.
   • رمز التحديث يُستخدم مرّة واحدة، ومهلة إعادة الاستخدام 10 ثوانٍ؛ تحديثان
     متوازيان يُلغيان الجلسة كلّها — لذلك التحديث مُتسلسل بوعد واحد مشترك.
   • رابط Storage الموقَّع نسبيّ، ويجب أن يُسبق بـ ${url}/storage/v1 لا بـ${url}.
   ============================================================================ */
var IAQ = (function () {
  'use strict';

  var CFG = window.IAQ_SUPABASE || { url: '', key: '' };
  var S = window.IAQ_SESSION || null;
  var SKEY = 'iaq_session';

  /* ------------------------------ أدوات نصّية ------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(s) { return esc(s); }
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  /* ------------------------------- الجلسة ------------------------------- */
  var refreshing = null;               // وعد واحد مشترك — لا تحديثين متوازيين أبدًا

  function saveSession(d) {
    S = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)),
      email: (d.user && d.user.email) || (S && S.email) || ''
    };
    // كتابة واحدة تحمل الرمزين والمهلة معًا — كتابة جزئية تُخرج المدير عند التحديث التالي
    try { sessionStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { }
    window.IAQ_SESSION = S;
    return S;
  }

  function logout(msg) {
    try { sessionStorage.removeItem(SKEY); } catch (e) { }
    if (msg) { try { sessionStorage.setItem('iaq_login_msg', msg); } catch (e) { } }
    location.replace(window.IAQ_LOGIN || 'index.html');
  }

  function refreshToken() {
    if (refreshing) return refreshing;
    if (!S || !S.refresh_token) { logout('انتهت الجلسة، يرجى الدخول من جديد.'); return Promise.reject(new Error('no refresh token')); }
    refreshing = fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: S.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error('refresh failed ' + r.status);
      return r.json();
    }).then(function (d) {
      if (!d.access_token) throw new Error('refresh returned no token');
      saveSession(d);
      refreshing = null;
      return S;
    }).catch(function (e) {
      refreshing = null;
      logout('انتهت صلاحية الجلسة، يرجى الدخول من جديد.');
      throw e;
    });
    return refreshing;
  }

  function nearExpiry() { return !S || !S.expires_at || (S.expires_at * 1000 - Date.now() < 60000); }

  /* ------------------------------ طلب أساسي ------------------------------ */
  function headers(extra, json) {
    var h = { apikey: CFG.key, Authorization: 'Bearer ' + (S ? S.access_token : '') };
    if (json) h['Content-Type'] = 'application/json';
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k];
    return h;
  }

  var ERR = {
    401: 'انتهت صلاحية الجلسة.',
    403: 'لا تملك صلاحية هذا الإجراء. تأكّد أن بريدك مُسجَّل في جدول المدراء.',
    404: 'الجدول أو المسار غير موجود. تأكّد من تشغيل مخطّط قاعدة البيانات.',
    409: 'تعارض: هذا السجلّ موجود مسبقًا.',
    413: 'الملف أكبر من الحدّ المسموح.',
    422: 'بيانات غير مقبولة.'
  };

  function fail(r, body) {
    var m = ERR[r.status];
    var detail = '';
    try {
      var j = typeof body === 'string' ? JSON.parse(body) : body;
      detail = (j && (j.message || j.msg || j.error_description || j.error || j.hint)) || '';
    } catch (e) { detail = typeof body === 'string' ? body.slice(0, 160) : ''; }
    var err = new Error((m || ('فشل الطلب (' + r.status + ')')) + (detail ? ' — ' + detail : ''));
    err.status = r.status;
    return err;
  }

  /* يُعيد المحاولة مرّة واحدة بعد تحديث الرمز عند 401 */
  function req(url, opt, retried) {
    opt = opt || {};
    var go = function () {
      return fetch(url, opt).then(function (r) {
        if (r.status === 401 && !retried) {
          return refreshToken().then(function () {
            opt.headers = headers(opt.__extra, opt.__json);
            return req(url, opt, true);
          });
        }
        if (!r.ok) return r.text().then(function (b) { throw fail(r, b); });
        return r;
      });
    };
    if (!retried && nearExpiry() && S && S.refresh_token) return refreshToken().then(function () {
      opt.headers = headers(opt.__extra, opt.__json);
      return go();
    });
    return go();
  }

  function jsonOf(r) {
    var ct = r.headers.get('content-type') || '';
    if (r.status === 204 || !ct) return null;
    return r.json();
  }

  /* --------------------------- واجهة قاعدة البيانات --------------------------- */
  function intId(id) {
    var n = Number(id);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) {
      throw new Error('معرّف غير صالح — أُلغي الإجراء حمايةً للبيانات.');
    }
    return n;
  }

  var api = {
    /* q: سلسلة استعلام PostgREST جاهزة، مثال: 'select=*&order=id.desc&limit=50' */
    select: function (table, q, extraHeaders) {
      var o = { method: 'GET', __extra: extraHeaders };
      o.headers = headers(extraHeaders, false);
      return req(CFG.url + '/rest/v1/' + table + '?' + (q || 'select=*'), o).then(jsonOf);
    },
    /* العدد الكلّي من ترويسة Content-Range — بلا جسم استجابة */
    count: function (table, q) {
      var o = { method: 'HEAD', __extra: { Prefer: 'count=exact' } };
      o.headers = headers(o.__extra, false);
      return req(CFG.url + '/rest/v1/' + table + '?' + (q || 'select=id'), o).then(function (r) {
        var cr = r.headers.get('content-range') || '';
        var n = parseInt(cr.split('/')[1], 10);
        return isFinite(n) ? n : 0;
      });
    },
    insert: function (table, rows, sel) {
      var o = { method: 'POST', body: JSON.stringify(rows), __json: true,
                __extra: { Prefer: 'return=representation' } };
      o.headers = headers(o.__extra, true);
      return req(CFG.url + '/rest/v1/' + table + (sel ? '?select=' + sel : ''), o).then(jsonOf);
    },
    update: function (table, id, patch) {
      var n;
      try { n = intId(id); } catch (e) { return Promise.reject(e); }
      var o = { method: 'PATCH', body: JSON.stringify(patch), __json: true,
                __extra: { Prefer: 'return=representation' } };
      o.headers = headers(o.__extra, true);
      return req(CFG.url + '/rest/v1/' + table + '?id=eq.' + n, o).then(jsonOf);
    },
    /* تحديث بمُرشِّح صريح — يجب أن يحتوي المُرشِّح على '=' وإلا رُفض */
    updateWhere: function (table, filter, patch) {
      if (!filter || filter.indexOf('=') < 0) return Promise.reject(new Error('مُرشِّح مفقود — أُلغي التحديث.'));
      var o = { method: 'PATCH', body: JSON.stringify(patch), __json: true,
                __extra: { Prefer: 'return=representation' } };
      o.headers = headers(o.__extra, true);
      return req(CFG.url + '/rest/v1/' + table + '?' + filter, o).then(jsonOf);
    },
    upsert: function (table, rows, onConflict) {
      var q = onConflict ? '?on_conflict=' + encodeURIComponent(onConflict) : '';
      var o = { method: 'POST', body: JSON.stringify(rows), __json: true,
                __extra: { Prefer: 'resolution=merge-duplicates,return=representation' } };
      o.headers = headers(o.__extra, true);
      return req(CFG.url + '/rest/v1/' + table + q, o).then(jsonOf);
    },
    remove: function (table, id) {
      var n;
      try { n = intId(id); } catch (e) { return Promise.reject(e); }
      var o = { method: 'DELETE', __extra: { Prefer: 'return=representation' } };
      o.headers = headers(o.__extra, false);
      return req(CFG.url + '/rest/v1/' + table + '?id=eq.' + n, o).then(jsonOf);
    },
    removeWhere: function (table, filter) {
      if (!filter || filter.indexOf('=') < 0) return Promise.reject(new Error('مُرشِّح مفقود — أُلغي الحذف.'));
      var o = { method: 'DELETE', __extra: { Prefer: 'return=representation' } };
      o.headers = headers(o.__extra, false);
      return req(CFG.url + '/rest/v1/' + table + '?' + filter, o).then(jsonOf);
    }
  };

  /* ----------------------------- مستودع الملفات ----------------------------- */
  var storage = {
    upload: function (bucket, path, file, overwrite) {
      var o = { method: overwrite ? 'PUT' : 'POST', body: file };
      o.__extra = overwrite ? { 'x-upsert': 'true' } : null;
      o.headers = headers(o.__extra, false);        // بلا Content-Type: يُشتقّ من الملف
      return req(CFG.url + '/storage/v1/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), o)
        .then(jsonOf);
    },
    list: function (bucket, prefix) {
      var o = { method: 'POST', __json: true,
                body: JSON.stringify({ prefix: prefix || '', limit: 200, offset: 0, sortBy: { column: 'name', order: 'asc' } }) };
      o.headers = headers(null, true);
      return req(CFG.url + '/storage/v1/object/list/' + bucket, o).then(jsonOf);
    },
    remove: function (bucket, paths) {
      var o = { method: 'DELETE', __json: true, body: JSON.stringify({ prefixes: paths }) };
      o.headers = headers(null, true);
      return req(CFG.url + '/storage/v1/object/' + bucket, o).then(jsonOf);
    },
    publicUrl: function (bucket, path, dlName) {
      var u = CFG.url + '/storage/v1/object/public/' + bucket + '/' +
              path.split('/').map(encodeURIComponent).join('/');
      return dlName ? u + '?download=' + encodeURIComponent(dlName) : u;
    }
  };

  /* -------------------------------- الواجهة -------------------------------- */
  var toastEl = null, toastT = null;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = kind === 'err' ? '#8c3d1c' : (kind === 'warn' ? '#7a5518' : '');
    toastEl.classList.add('show');
    if (toastT) clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, kind === 'err' ? 5200 : 2400);
  }

  function card(title, body, foot) {
    return '<div class="ad-card">' + (title ? '<h3>' + esc(title) + '</h3>' : '') + body +
           (foot ? '<div class="btnbar">' + foot + '</div>' : '') + '</div>';
  }
  function notice(html, kind) {
    return '<div class="notice"' + (kind === 'ok' ? ' style="background:#eef4f3;border-color:#d6e5e3;color:#0c6c6c"' : '') + '>' + html + '</div>';
  }
  function head(title, sub) {
    return '<div class="view-head"><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function iconBtn(act, path, o) {
    o = o || {};
    return '<button class="ib' + (o.danger ? ' danger' : '') + (o.sm ? ' sm' : '') + '" data-act="' + attr(act) + '"' +
      (o.id != null ? ' data-id="' + attr(o.id) + '"' : '') +
      (o.arg != null ? ' data-arg="' + attr(o.arg) + '"' : '') +
      ' title="' + attr(o.label || act) + '" aria-label="' + attr(o.label || act) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg></button>';
  }
  function spinner(msg) {
    return '<div class="ad-card" style="text-align:center;padding:44px"><div class="muted">' + esc(msg || 'جارٍ التحميل…') + '</div></div>';
  }
  function empty(msg) {
    return '<div style="text-align:center;padding:38px 16px" class="muted">' + esc(msg) + '</div>';
  }
  function table(cols, rows) {
    var h = '<div style="overflow-x:auto"><table class="tbl"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    h += rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('');
    return h + '</tbody></table></div>';
  }

  /* حوار تأكيد — لا نستخدم confirm() الأصلي كي يبقى المظهر موحّدًا */
  function ask(msg, okLabel) {
    return new Promise(function (res) {
      var ov = document.createElement('div');
      ov.className = 'sub-ov show';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(4,52,44,.42);z-index:200;display:grid;place-items:center;padding:20px';
      ov.innerHTML = '<div class="ad-card" style="max-width:440px;margin:0"><h3>تأكيد</h3><p style="margin-block-end:18px">' +
        esc(msg) + '</p><div class="btnbar"><button class="btn ghost" data-x="0">إلغاء</button>' +
        '<button class="btn danger" data-x="1">' + esc(okLabel || 'تأكيد') + '</button></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) {
        var b = e.target.closest('[data-x]');
        if (b) { ov.remove(); res(b.getAttribute('data-x') === '1'); }
        else if (e.target === ov) { ov.remove(); res(false); }
      });
    });
  }

  /* لوح جانبي */
  function drawer(title, html) {
    var d = $('#iaqDrawer');
    if (!d) {
      d = document.createElement('div');
      d.id = 'iaqDrawer';
      d.className = 'side-drawer';
      document.body.appendChild(d);
      var ov = document.createElement('div');
      ov.className = 'sub-ov'; ov.id = 'iaqDrawerOv';
      ov.addEventListener('click', closeDrawer);
      document.body.appendChild(ov);
    }
    d.innerHTML = '<div class="drawer-head"><div class="dh-name">' + esc(title) + '</div>' +
      '<button class="ib sm" data-act="closeDrawer" aria-label="إغلاق"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="drawer-body">' + html + '</div>';
    document.body.classList.add('subopen');
    $('#iaqDrawerOv').classList.add('show');
    return d;
  }
  function closeDrawer() {
    document.body.classList.remove('subopen');
    var ov = $('#iaqDrawerOv'); if (ov) ov.classList.remove('show');
  }

  var fmt = {
    date: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    },
    day: function (iso) {
      if (!iso) return '—';
      var d = new Date(iso); if (isNaN(d)) return String(iso);
      return d.toISOString().slice(0, 10);
    },
    num: function (n) { return (Number(n) || 0).toLocaleString('en-US'); },
    bytes: function (n) {
      n = Number(n) || 0;
      if (n < 1024) return n + ' بايت';
      if (n < 1048576) return (n / 1024).toFixed(0) + ' ك.ب';
      return (n / 1048576).toFixed(1) + ' م.ب';
    },
    cut: function (s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
  };

  /* --------------------------- سجلّ التدقيق --------------------------- */
  function audit(action, entity, entityId) {
    return api.insert('audit_log', {
      actor_email: (S && S.email) || '', action: action,
      entity: entity || null, entity_id: entityId == null ? null : String(entityId)
    }).catch(function () { /* السجلّ لا يُفشل الإجراء */ });
  }

  /* ------------------------------ المُوجّه ------------------------------ */
  var views = {}, order = [], current = null;

  var registry = {
    register: function (key, def) {
      if (views[key]) return;
      views[key] = def; order.push(key);
    }
  };

  function renderSidebar() {
    var nav = $('#sidebarNav'); if (!nav) return;
    var groups = [], byGroup = {};
    order.forEach(function (k) {
      var g = views[k].group || 'عام';
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push(k);
    });
    nav.innerHTML = groups.map(function (g) {
      return '<div class="nav-group">' + esc(g) + '</div>' + byGroup[g].map(function (k) {
        var v = views[k];
        return '<button class="nav-item' + (k === current ? ' active' : '') + '" data-view="' + attr(k) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          (v.icon || '<circle cx="12" cy="12" r="8"/>') + '</svg><span>' + esc(v.label || k) + '</span>' +
          (v.badge ? '<span class="right chip">' + esc(v.badge) + '</span>' : '') + '</button>';
      }).join('');
    }).join('');
  }

  function go(key) {
    if (!views[key]) key = order[0];
    current = key;
    try { location.hash = '#' + key; } catch (e) { }
    renderSidebar();
    document.body.classList.remove('drawer');
    closeDrawer();
    var mount = $('#viewArea');
    mount.innerHTML = spinner();
    var t0 = Date.now();
    Promise.resolve()
      .then(function () { return views[key].render(mount); })
      .catch(function (e) {
        mount.innerHTML = head(views[key].label || key) +
          notice('<b>تعذّر تحميل هذه الشاشة.</b><br>' + esc(e && e.message ? e.message : e));
        if (e && e.status === 403) toast(ERR[403], 'err');
      })
      .then(function () { if (Date.now() - t0 > 8000) toast('اكتمل التحميل', 'ok'); });
  }

  /* تفويض الأحداث: كل زرّ داخل الشاشة يُعالَج عبر data-act */
  var acts = {};
  function on(act, fn) { acts[act] = fn; }
  document.addEventListener('click', function (e) {
    var nav = e.target.closest('[data-view]');
    if (nav) { go(nav.getAttribute('data-view')); return; }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'closeDrawer') { closeDrawer(); return; }
    if (acts[a]) { e.preventDefault(); acts[a](b, e); }
  });

  /* ------------------------------- الإقلاع ------------------------------- */
  function boot() {
    var hamb = $('#hamb'), ov = $('#drawerOv');
    if (hamb) hamb.addEventListener('click', function () { document.body.classList.toggle('drawer'); });
    if (ov) ov.addEventListener('click', function () { document.body.classList.remove('drawer'); });
    window.addEventListener('hashchange', function () {
      var k = location.hash.replace('#', '');
      if (k && k !== current && views[k]) go(k);
    });

    var badge = $('#whoBadge');
    if (badge) badge.textContent = (S && S.email) || '';

    // التحقّق من الصلاحية: القراءة الممنوعة ترجع مصفوفة فارغة لا خطأ،
    // وسياسة «admins read self» ترجع صفّ المدير نفسه فقط.
    api.select('admins', 'select=email,name,role&limit=1').then(function (rows) {
      var mount = $('#viewArea');
      if (!rows || !rows.length) {
        if (badge) badge.textContent = 'غير مخوّل';
        mount.innerHTML = head('حساب غير مخوّل') + notice(
          '<b>بريدك ليس مُسجَّلًا في جدول المدراء.</b><br>' +
          'الدخول نجح، لكن قاعدة البيانات لا تعترف بهذا الحساب كمدير، فكل قراءة وكتابة ستُرفض.<br>' +
          'شغّل هذا في Supabase → SQL Editor ثم أعد الدخول:<br>' +
          '<code class="mono" style="display:block;margin-block-start:8px;white-space:pre-wrap">insert into public.admins (email, name, role)\nvalues (' + "'" + esc((S && S.email) || '') + "'" + ', \'مدير النظام\', \'admin\')\non conflict (email) do nothing;</code>');
        $('#sidebarNav').innerHTML = '';
        return;
      }
      IAQ.me = rows[0];
      if (badge) badge.textContent = (rows[0].name || rows[0].email) + ' · ' + (rows[0].role === 'admin' ? 'مدير' : rows[0].role);
      var k = location.hash.replace('#', '');
      go(views[k] ? k : order[0]);
    }).catch(function (e) {
      $('#viewArea').innerHTML = head('تعذّر الاتصال') + notice(
        '<b>تعذّر التحقّق من الحساب.</b><br>' + esc(e && e.message ? e.message : e) +
        '<br>إن كان الخطأ 404 فلم يُشغّل مخطّط قاعدة البيانات بعد.');
    });
  }

  return {
    cfg: CFG, session: function () { return S; }, me: null,
    api: api, storage: storage, audit: audit,
    views: registry, go: go, on: on, boot: boot,
    ui: { toast: toast, card: card, notice: notice, head: head, iconBtn: iconBtn,
          spinner: spinner, empty: empty, table: table, ask: ask,
          drawer: drawer, closeDrawer: closeDrawer, esc: esc, attr: attr, $: $, $$: $$ },
    fmt: fmt
  };
})();
