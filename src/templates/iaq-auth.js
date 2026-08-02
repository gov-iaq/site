/* ============================================================================
   جلسة لوحة المدير — تخزينٌ يبقى، وتجديدٌ تلقائيّ.

   العطب الذي تُصلحه هذه الوحدة: الجلسة كانت في sessionStorage — يُمحى بإغلاق
   التبويب — و refresh_token كان يُحفظ **ولا يُستعمل أبدًا**. فبعد ساعةٍ من
   الدخول تنتهي صلاحية الرمز، فتُخرج البوّابةُ المديرَ وتُظهر الشاشاتُ
   «JWT expired (401)» وأرقامًا فارغة.

   ثلاث طبقاتٍ من الحماية من انتهاء الصلاحية:
     • تجديدٌ استباقيّ: مؤقّتٌ يُجدّد قبل النهاية بخمس دقائق.
     • تجديدٌ عند اليقظة: العودة إلى التبويب بعد نومٍ طويل تُجدّد فورًا.
     • تجديدٌ عند الرفض: أي طلبٍ يُرَدُّ بـ401 يُجدّد ويُعاد مرّةً واحدة.

   والتخزين: localStorage إن اختار المدير «ابقني داخلًا» (وهو الافتراض)،
   وإلّا sessionStorage فتنتهي الجلسة بإغلاق التبويب. الرمز في التخزين المحليّ
   مقايضةٌ معروفة: راحةُ البقاء مقابل بقائه على الجهاز — ولذلك يبقى الخيار
   بيد المدير، ويمحوه «خروج» من الموضعين.
   ============================================================================ */
(function () {
  'use strict';
  var KEY = 'iaq_session';
  var CFG = window.IAQ_SUPABASE || window.IAQ_SUPA || null;

  function stores() {
    var out = [];
    try { if (window.localStorage) out.push(window.localStorage); } catch (e) { }
    try { if (window.sessionStorage) out.push(window.sessionStorage); } catch (e) { }
    return out;
  }

  /* يُقرأ من التخزين الدائم أوّلًا ثم المؤقّت — فلا يُفقد بإغلاق التبويب */
  function read() {
    var ss = stores();
    for (var i = 0; i < ss.length; i++) {
      try {
        var raw = ss[i].getItem(KEY);
        if (!raw) continue;
        var s = JSON.parse(raw);
        if (s && s.access_token) return s;
      } catch (e) { }
    }
    return null;
  }

  function write(s, persist) {
    var raw = JSON.stringify(s);
    var ss = stores();
    /* يُكتب في واحدٍ ويُمحى من الآخر: نسختان تتباعدان أسوأ من واحدة */
    try {
      if (persist && window.localStorage) {
        window.localStorage.setItem(KEY, raw);
        if (window.sessionStorage) window.sessionStorage.removeItem(KEY);
      } else if (window.sessionStorage) {
        window.sessionStorage.setItem(KEY, raw);
        if (window.localStorage) window.localStorage.removeItem(KEY);
      } else if (ss.length) {
        ss[0].setItem(KEY, raw);
      }
    } catch (e) { }
  }

  function clear() {
    stores().forEach(function (st) { try { st.removeItem(KEY); } catch (e) { } });
  }

  function expAt(s) { return (s && Number(s.expires_at)) ? Number(s.expires_at) * 1000 : 0; }
  function left(s) { return expAt(s) - Date.now(); }
  function valid(s) { return !!(s && s.access_token && left(s) > 5000); }

  var cur = read();
  var pending = null;

  /* الرمز الحاليّ — تستعمله كل الشاشات بدل قراءة access_token مباشرةً،
     فيصل إليها الرمز المُجدَّد بلا إعادة تحميل. */
  function token() { return cur ? cur.access_token : ''; }
  function email() { return cur ? (cur.email || '') : ''; }
  function persisted() {
    try { return !!(window.localStorage && window.localStorage.getItem(KEY)); }
    catch (e) { return false; }
  }

  /* تجديدٌ واحدٌ في وقتٍ واحد: نداءان متزامنان يتشاركان الوعد نفسه، وإلّا
     أبطل أحدُهما رمزَ الآخر (سوپابيز يُدوّر refresh_token عند كل تجديد). */
  function refresh() {
    if (pending) return pending;
    var s = cur || read();
    if (!CFG || !CFG.url || !CFG.key || !s || !s.refresh_token) {
      return Promise.reject(new Error('no-refresh-token'));
    }
    pending = fetch(CFG.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, d: j }; });
    }).then(function (res) {
      if (!res.ok || !res.d || !res.d.access_token) {
        throw new Error((res.d && (res.d.error_description || res.d.msg)) || 'refresh-failed');
      }
      var d = res.d;
      cur = {
        access_token: d.access_token,
        refresh_token: d.refresh_token || s.refresh_token,
        expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)),
        email: (d.user && d.user.email) || s.email || ''
      };
      write(cur, persisted());
      if (window.IAQ_SESSION) {
        /* الشاشات القديمة تقرأ الكائن نفسه، فنُحدّثه في مكانه لا نستبدله */
        window.IAQ_SESSION.access_token = cur.access_token;
        window.IAQ_SESSION.refresh_token = cur.refresh_token;
        window.IAQ_SESSION.expires_at = cur.expires_at;
      }
      arm();
      pending = null;
      return cur;
    }).catch(function (e) {
      pending = null;
      throw e;
    });
    return pending;
  }

  /* تجديدٌ استباقيّ قبل النهاية بخمس دقائق. المؤقّت يُسلَّح من جديد بعد كل
     تجديد، ولا نضع مدّةً أطول من ست ساعاتٍ لأن setTimeout يفيض بعدها. */
  var timer = null;
  function arm() {
    if (timer) clearTimeout(timer);
    if (!cur) return;
    var ms = Math.min(left(cur) - 5 * 60 * 1000, 6 * 3600 * 1000);
    if (ms < 1000) ms = 1000;
    timer = setTimeout(function () { refresh().catch(function () { }); }, ms);
  }
  arm();

  /* العودة إلى التبويب بعد نومٍ طويل: المؤقّتات تتوقّف في التبويبات النائمة */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !cur) return;
    if (left(cur) < 6 * 60 * 1000) refresh().catch(function () { });
  });

  /* يُغلّف أي طلبٍ مُصادَق: يُجدّد ويُعيد مرّةً واحدة عند 401 */
  function withAuth(run) {
    return run(token()).then(function (r) {
      if (r && r.status === 401) {
        return refresh().then(function () { return run(token()); });
      }
      return r;
    });
  }

  function logout() {
    var t = token();
    try {
      if (CFG && CFG.url && t) {
        fetch(CFG.url + '/auth/v1/logout', {
          method: 'POST', keepalive: true,
          headers: { apikey: CFG.key, Authorization: 'Bearer ' + t }
        });
      }
    } catch (e) { }
    clear();
    cur = null;
    if (timer) clearTimeout(timer);
  }

  window.IAQ_AUTH = {
    read: read, write: write, clear: clear,
    valid: valid, left: left, persisted: persisted,
    token: token, email: email,
    refresh: refresh, withAuth: withAuth, logout: logout,
    session: function () { return cur; }
  };
})();
