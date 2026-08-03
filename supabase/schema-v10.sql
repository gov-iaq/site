-- ============================================================================
--  حاضنة الجمعيات — الترقية العاشرة: سدُّ ثلاث ثغراتٍ في الصلاحيات
--
--  كشفها فريقٌ استشاريٌّ وتحقّقتُ منها سطرًا سطرًا قبل الكتابة. ليست فرضياتٍ
--  نظرية: كلُّ واحدةٍ منها مسارٌ عمليٌّ يرفع «محرّرًا» فوق صلاحيته.
--
--  يُشغَّل بعد setup.sql و schema-v8.sql و schema-v9.sql.
--  إضافيٌّ محضٌ وقابلٌ لإعادة التشغيل.
-- ============================================================================

-- ═════════════ ١) الثغرة الأولى: ترقيةُ الذات إلى مالك ═════════════
--
--  السلسلة كما تحقّقتُ منها:
--    • is_admin() تصدق لأيّ صفٍّ في admins **بأيّ دور** — حتى «قارئ»
--      (setup.sql: لا شرطَ على role فيها، بخلاف is_editor و is_owner).
--    • سياسة «audit admin insert» تسمح بالإدراج في audit_log بـis_admin().
--    • undo_change تشترط is_editor() فقط، و'admins' في قائمتها المسموحة،
--      وتُدرج بـsecurity definer فتتخطّى RLS، وتنفيذها ممنوحٌ لكل مُصادَق.
--  فيلفّق المحرّرُ قيدًا: entity='admins' و action='delete' و old_row فيه
--  role='admin'، ثم ينادي undo_change — فتُدرج الدالّةُ الصفَّ بصفةِ مالكِ
--  الدالّة، وتُبطَل الأدوارُ من خارجها.
--
--  السدُّ ثلاثيّ، ولا يكفي واحدٌ منه وحده:

--  (أ) السجلّ لا يُكتب من المتصفّح إطلاقًا. لا حاجةَ له: log_change نفسها
--      security definer فتكتب بصفة مالكها، والتراجعُ يكتب من داخل القاعدة.
drop policy if exists "audit admin insert" on public.audit_log;
revoke insert, update on public.audit_log from authenticated, anon;

--  (ب) جدول الحسابات يخرج من قائمة التراجع: أدوارُ المستخدمين لا تُدار
--      بالتراجع أبدًا، وإنّما من شاشة «المستخدمون والأدوار» بسياساتها.
--      و settings يخرج معه: مفتاحُ الأكواد فيه، وإعادته تُعيد كودًا مُزال.
create or replace function public.undo_change(log_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.audit_log;
  later    int;
  ent      text;
  wh       text;
  setlist  text;
  --  بلا 'admins' وبلا 'settings': الأولى تُبطل نظام الأدوار، والثانية
  --  تُعيد كودًا مخصّصًا أُزيل — وكلاهما تصعيدُ صلاحية لا تراجعُ محتوى.
  ALLOWED  text[] := array['news','documents','people','partners','hero_slides',
                           'menu_items','submissions','content_overrides','media'];
begin
  if not public.is_editor() then
    return jsonb_build_object('ok', false, 'why', 'لا صلاحية للتراجع');
  end if;

  select * into r from public.audit_log where id = log_id;
  if r.id is null then
    return jsonb_build_object('ok', false, 'why', 'القيد غير موجود');
  end if;
  if r.undone_at is not null then
    return jsonb_build_object('ok', false, 'why', 'تُرَاجِع عنه سلفًا');
  end if;
  if r.undo_of is not null then
    return jsonb_build_object('ok', false, 'why', 'هذا القيد تراجعٌ — لا تراجعَ عن تراجع');
  end if;
  if r.skipped = 'pii' then
    return jsonb_build_object('ok', false, 'why', 'قيدُ بياناتٍ شخصية لا تُستعاد');
  end if;
  if r.skipped = 'size' then
    return jsonb_build_object('ok', false, 'why', 'القيمة أكبر من سقف التخزين فلم تُحفظ');
  end if;
  if r.pk is null or r.entity is null then
    return jsonb_build_object('ok', false, 'why', 'قيدٌ قديمٌ بلا قيمٍ محفوظة — سابقٌ لترقية v9');
  end if;

  ent := r.entity;
  if not (ent = any(ALLOWED)) then
    return jsonb_build_object('ok', false, 'why',
      'جدولُ «' || ent || '» لا يُتراجَع فيه: الحساباتُ والإعداداتُ تُدار من شاشتها');
  end if;

  select count(*) into later
    from public.audit_log a
   where a.entity = r.entity
     and a.entity_id is not distinct from r.entity_id
     and a.created_at > r.created_at
     and a.undo_of is null;
  if later > 0 then
    return jsonb_build_object('ok', false, 'why',
      'يوجد ' || later || ' تعديلًا بعد هذا — استعرض القيمة القديمة وانسخها يدويًّا',
      'later', later);
  end if;

  select string_agg(format('%I = %L', kk, vv), ' and ')
    into wh from jsonb_each_text(r.pk) as e(kk, vv);
  if wh is null then
    return jsonb_build_object('ok', false, 'why', 'مفتاحٌ فارغ');
  end if;

  if r.action = 'insert' then
    execute format('delete from public.%I where %s', ent, wh);

  elsif r.action = 'delete' then
    if r.old_row is null then
      return jsonb_build_object('ok', false, 'why', 'لا صفَّ محفوظًا لإعادته');
    end if;
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      ent, ent) using r.old_row;

  else
    if r.old_row is null then
      return jsonb_build_object('ok', false, 'why', 'لا قيمٍ قديمةٍ محفوظة');
    end if;
    select string_agg(format('%I = r.%I', kk, kk), ', ')
      into setlist
      from jsonb_object_keys(r.old_row) as e(kk)
     where not (r.pk ? kk);
    if setlist is null then
      return jsonb_build_object('ok', false, 'why', 'لا أعمدةَ للاستعادة');
    end if;
    execute format(
      'update public.%I as t set %s from jsonb_populate_record(null::public.%I, $1) as r where %s',
      ent, setlist, ent, wh) using r.old_row;
  end if;

  update public.audit_log
     set undone_at = now(),
         undone_by = lower(coalesce(auth.jwt() ->> 'email', ''))
   where id = log_id;

  update public.audit_log
     set undo_of = log_id
   where id = (select max(id) from public.audit_log
                where entity = ent and txid = txid_current() and undo_of is null);

  return jsonb_build_object('ok', true, 'entity', ent, 'action', r.action);
end;
$$;

--  (ج) is_admin() لم تكن تفحص الدور فصارت مرادفًا لـ«أيُّ حسابٍ مسجَّل».
--      نُصلحها لتعني «محرّرٌ أو مالك» — وهو ما تفترضه كلُّ سياسةٍ تستعملها.
--      والقارئ (viewer) يبقى قارئًا فعلًا لا كاتبًا.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and a.role in ('admin', 'editor')
  );
$$;

-- ═════════════ ٢) الثغرة الثانية: كودٌ يُنفَّذ بصلاحية محرّر ═════════════
--
--  طبقةُ المظهر تُعيد بناء وسوم <script> كي تُنفَّذ فعلًا، ومصدرُها
--  settings.code العلنيّ. وسياسةُ كتابة settings تسمح بـis_editor().
--  فمحرّرٌ واحدٌ يكتب سطرًا يُنفَّذ عند كل زائرٍ للموقع — وفي إطار المعاينة
--  داخل اللوحة، وهو من أصل اللوحة نفسه فيقرأ رمزَ جلسة المالك.
--
--  السدّ: مفتاحُ الأكواد للمالك وحده. وسياساتُ PostgreSQL تُجمَع بـOR، فلا
--  يكفي إضافةُ سياسةٍ مُقيِّدة — يلزم إسقاطُ الواسعة أوّلًا ثم كتابةُ بديلٍ
--  يستثني المفتاح.
drop policy if exists "settings admin write" on public.settings;
drop policy if exists "settings editor write" on public.settings;
drop policy if exists "settings owner code" on public.settings;

--  المحرّر يكتب كلَّ مفتاحٍ إلّا 'code'
create policy "settings editor write" on public.settings
  for all to authenticated
  using (public.is_editor() and key <> 'code')
  with check (public.is_editor() and key <> 'code');

--  والمالك وحده يكتب 'code'
create policy "settings owner code" on public.settings
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- ═════════════ ٣) تضييق قراءة السجلّ ═════════════
--  مع تخزين الصفوف كاملةً صار السجلّ حاملًا لبياناتٍ حسّاسة. والقراءة كانت
--  is_editor() وهو صحيح، لكن نُثبّته صريحًا بعد تغيير is_admin.
drop policy if exists "audit editor read" on public.audit_log;
create policy "audit editor read" on public.audit_log
  for select to authenticated using (public.is_editor());

-- ============================================================================
--  تحقّق بعد التشغيل
-- ============================================================================
select 'is_admin تفحص الدور' as البند,
       (case when exists (
          select 1 from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'is_admin'
             and pg_get_functiondef(p.oid) like '%role in (''admin'', ''editor'')%')
        then 'نعم' else 'لا — أعِد التشغيل' end) as القيمة
union all
select 'سياسة إدراجٍ في السجلّ',
       (select coalesce(string_agg(polname, ' · '), 'لا شيء ✓')::text
          from pg_policy where polrelid = 'public.audit_log'::regclass and polcmd = 'a')
union all
select 'admins في قائمة التراجع',
       (case when exists (
          select 1 from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname = 'undo_change'
             and pg_get_functiondef(p.oid) like '%''admins''%')
        then 'نعم — أعِد التشغيل' else 'لا ✓' end)
union all
select 'سياسات settings',
       (select string_agg(polname, ' · ' order by polname)::text
          from pg_policy where polrelid = 'public.settings'::regclass)
union all
select 'حساباتٌ بدور قارئ',
       (select count(*)::text from public.admins where role = 'viewer');
-- ============================================================================
