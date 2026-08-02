-- ============================================================================
--  حاضنة الجمعيات — الترقية التاسعة
--
--  ثلاثة أغراض:
--    ١) خلفيةٌ لكل شريحة في السلايدر (أو واحدةٌ للجميع كما هو الحال).
--    ٢) سجلُّ تعديلاتٍ يحفظ الصفَّ **قبل** التعديل وبعده — وبلا ذلك لا تراجعَ
--       ممكن. السجلّ اليوم يحفظ «من فعل ماذا» ولا يحفظ «ماذا كان».
--    ٣) دالّةُ تراجعٍ ترفض نفسها إن جرى تعديلٌ أحدث على الصفّ نفسه، وحذفٌ
--       تلقائيّ لما تجاوز المدّة المحدّدة.
--
--  إضافيٌّ محضٌ وقابلٌ لإعادة التشغيل: كل جدولٍ بـif not exists، وكل دالّةٍ
--  بـcreate or replace، وكل سياسةٍ تُحذف قبل إنشائها.
--
--  يُشغَّل **بعد** supabase/setup.sql و supabase/schema-v8.sql.
-- ============================================================================

-- ═════════════════════ ١) خلفيةٌ لكل شريحة ═════════════════════
--  فارغٌ = خُذ الخلفية العامّة (settings.hero_bg_image) — فلا يتغيّر شيءٌ
--  على الموقع حتى يضع المدير صورةً لشريحةٍ بعينها.
alter table public.hero_slides add column if not exists bg_image   text;
alter table public.hero_slides add column if not exists bg_overlay smallint;

-- ═════════════════════ ٢) توسيع سجلّ العمل ═════════════════════
alter table public.audit_log add column if not exists old_row    jsonb;
alter table public.audit_log add column if not exists new_row    jsonb;
--  المفتاح كائنًا لا نصًّا: {"id":12} أو {"key":"theme"} — فيعمل مع settings
--  التي مفتاحها key لا id، ومع أي جدولٍ مفتاحه مركَّب.
alter table public.audit_log add column if not exists pk         jsonb;
--  معرّف المعاملة: يجمع دفعةً واحدةً (استيراد إكسل يُرسل مصفوفةً في طلب واحد)
alter table public.audit_log add column if not exists txid       bigint;
alter table public.audit_log add column if not exists undone_at  timestamptz;
alter table public.audit_log add column if not exists undone_by  text;
--  إن كان هذا القيدُ نفسه تراجعًا: معرّف القيد الذي تُرَاجع عنه
alter table public.audit_log add column if not exists undo_of    bigint;
--  سببُ عدم تخزين المحتوى: 'pii' لبيانات الزوّار، 'size' لما تجاوز السقف
alter table public.audit_log add column if not exists skipped    text;

--  نداءٌ في كل تراجع: «هل يوجد قيدٌ أحدث على هذا الصفّ؟» — وهو اليوم مسحٌ كامل
create index if not exists audit_entity_idx
  on public.audit_log (entity, entity_id, created_at desc);
create index if not exists audit_txid_idx on public.audit_log (txid);

-- ═════════════════════ ٣) المُشغِّل: يحفظ ما كان ═════════════════════
--  يُعيد كتابة دالّة schema-v8 بثلاث زياداتٍ جوهرية:
--   • المفتاح يُبنى من كتالوج المفاتيح لا من افتراض 'id' — فيُصلح settings.
--   • الصفّان القديم والجديد يُخزَّنان كاملين، إلّا لجدولَي بيانات الزوّار.
--   • سقفُ حجمٍ يمنع تضخّم السجلّ بصورة شعارٍ مُدرَجةٍ base64 في settings.
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who     text := lower(coalesce(auth.jwt() ->> 'email', ''));
  act     text;
  eid     text;
  det     jsonb := null;
  pkcols  text[];
  jold    jsonb := null;
  jnew    jsonb := null;
  jpk     jsonb := null;
  why     text  := null;
  CAP     int   := 32768;      --  ٣٢ كيلوبايت لكل صفّ
  --  أعمدةٌ وحدها تُخزَّن من جدولَي البيانات الشخصية: لا أسماء ولا هواتف
  --  ولا نصوص رسائل. فالتراجع عن حالة طلبٍ لا يحتاج محتواه.
  PII     text[] := array['submissions', 'survey_responses'];
  SAFE    text[] := array['id', 'kind', 'status', 'created_at', 'updated_at',
                          'survey', 'updated_by'];
begin
  begin
    --  مفاتيح الجدول من الكتالوج. نقرؤها من pg_constraint لا من pg_index:
    --  conkey مصفوفةُ smallint حقيقيّة يعمل unnest عليها بلا تحويل، بخلاف
    --  indkey التي نوعها int2vector.
    select array_agg(a.attname order by k.ord)
      into pkcols
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.conrelid = tg_relid and c.contype = 'p';
    if pkcols is null then pkcols := array['id']; end if;

    if tg_op = 'INSERT' then
      act := 'insert';
      jnew := to_jsonb(new);
    elsif tg_op = 'DELETE' then
      act := 'delete';
      jold := to_jsonb(old);
      det := jsonb_build_object('label', left(coalesce(
               jold ->> 'title', jold ->> 'name',
               jold ->> 'label', jold ->> 'email', ''), 80));
    else
      act := 'update';
      jold := to_jsonb(old);
      jnew := to_jsonb(new);
      --  تغيّر الحالة يُسجَّل صراحةً: منه تُحسب مؤشّرات الردّ
      if (jold ? 'status') and (jold ->> 'status') is distinct from (jnew ->> 'status') then
        act := 'status';
        det := jsonb_build_object('from', jold ->> 'status', 'to', jnew ->> 'status');
      end if;
    end if;

    jpk := (select jsonb_object_agg(kk, vv)
              from jsonb_each(coalesce(jnew, jold)) as e(kk, vv)
             where kk = any(pkcols));
    eid := coalesce(jpk ->> pkcols[1], '');

    --  بيانات الزوّار: أعمدةٌ مُعدَّدةٌ فقط
    if tg_table_name = any(PII) then
      why := 'pii';
      jold := (select jsonb_object_agg(kk, vv) from jsonb_each(coalesce(jold, '{}'::jsonb))
                 as e(kk, vv) where kk = any(SAFE));
      jnew := (select jsonb_object_agg(kk, vv) from jsonb_each(coalesce(jnew, '{}'::jsonb))
                 as e(kk, vv) where kk = any(SAFE));
    end if;

    --  سقفُ الحجم: صورةٌ base64 في settings تُضخّم السجلّ بلا فائدة
    if pg_column_size(coalesce(jold, '{}'::jsonb)) + pg_column_size(coalesce(jnew, '{}'::jsonb)) > CAP then
      why := 'size';
      jold := null;
      jnew := null;
    end if;

    insert into public.audit_log
      (actor_email, action, entity, entity_id, detail, old_row, new_row, pk, txid, skipped)
    values
      (nullif(who, ''), act, tg_table_name, nullif(eid, ''), det,
       jold, jnew, jpk, txid_current(), why);
  exception when others then
    --  السجلّ لا يمنع العمل: خطأٌ فيه يُهمَل ويبقى الحفظ. والتحذير يظهر في
    --  سجلّ الخادم كي لا يُفشل التسجيلُ صامتًا إلى الأبد.
    raise warning 'log_change فشل على %: %', tg_table_name, sqlerrm;
  end;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

--  المُشغِّلات نفسها على الجداول نفسها: الدالّة وحدها تغيّرت، لكن نُعيد
--  تركيبها كي يعمل الملفّ على قاعدةٍ لم تُشغّل v8 بعد.
do $$
declare
  t text;
begin
  foreach t in array array['news','documents','people','partners','hero_slides',
                           'menu_items','submissions','settings','content_overrides',
                           'media','admins']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
      execute format(
        'create trigger %I after insert or update or delete on public.%I
           for each row execute function public.log_change()', t || '_audit', t);
    end if;
  end loop;
end $$;

-- ═════════════════════ ٤) التراجع ═════════════════════
--  الشروط مفروضةٌ في الدالّة لا في الواجهة: الواجهة تُتجاوَز بطلبٍ مباشر.
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
  ALLOWED  text[] := array['news','documents','people','partners','hero_slides',
                           'menu_items','submissions','settings','content_overrides',
                           'media','admins'];
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
    return jsonb_build_object('ok', false, 'why', 'جدولٌ غير مسموحٍ بالتراجع فيه');
  end if;

  --  الشرط الحاسم: استعادةُ صفٍّ قديمٍ تدهس كل ما جرى بعده. فإن وُجد قيدٌ
  --  أحدثُ على الصفّ نفسه رُفض التراجع — والدمج الآليّ بين تعديلين على الحقل
  --  نفسه تخمينٌ لا نُقدم عليه.
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

  --  شرطُ المفتاح من الكائن المحفوظ. %L على نصٍّ يصلح للأعداد أيضًا:
  --  «where id = '12'» يُحوَّل ضمنًا في بوستجرس.
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

  else   --  update أو status
    if r.old_row is null then
      return jsonb_build_object('ok', false, 'why', 'لا قيمٍ قديمةٍ محفوظة');
    end if;
    --  كل الأعمدة المحفوظة إلّا المفتاح — لا نكتب فوق المفتاح
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

  --  المُشغِّل سجّل عمليةَ التراجع نفسها؛ نَصِلُها بأصلها كي لا يُتَراجَع عنها
  update public.audit_log
     set undo_of = log_id
   where id = (select max(id) from public.audit_log
                where entity = ent and txid = txid_current() and undo_of is null);

  return jsonb_build_object('ok', true, 'entity', ent, 'action', r.action);
end;
$$;

--  دفعةٌ واحدة (استيراد إكسل مثلًا): تُراجَع بالترتيب العكسيّ في معاملةٍ واحدة
create or replace function public.undo_batch(tx bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec  record;
  ok   int := 0;
  bad  int := 0;
  last jsonb;
begin
  if not public.is_editor() then
    return jsonb_build_object('ok', false, 'why', 'لا صلاحية للتراجع');
  end if;
  for rec in select id from public.audit_log
              where txid = tx and undone_at is null and undo_of is null
              order by id desc
  loop
    last := public.undo_change(rec.id);
    if (last ->> 'ok')::boolean then ok := ok + 1; else bad := bad + 1; end if;
  end loop;
  return jsonb_build_object('ok', bad = 0, 'done', ok, 'failed', bad, 'last', last);
end;
$$;

-- ═════════════════════ ٥) حذف ما تجاوز المدّة ═════════════════════
--  المدّة الافتراضية شهر. لا pg_cron في هذا المشروع، فتُنفَّذ يدويًّا أو من
--  مهمّةٍ مجدولة في لوحة Supabase:  select public.purge_audit(30);
--  اسم المعامل keep_days لا days: «days => days» داخل make_interval يُلبِس
--  المعاملَ باسم الوسيط المُسمّى.
create or replace function public.purge_audit(keep_days int default 30)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  if not public.is_owner() then
    raise exception 'purge_audit: لا صلاحية';
  end if;
  delete from public.audit_log
   where created_at < now() - make_interval(days => greatest(keep_days, 1));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ═════════════════════ ٦) السياسات ═════════════════════
--  مع تخزين الصفوف كاملةً يصير السجلّ حاملًا لبياناتٍ حسّاسة. وسياسةُ القراءة
--  اليوم is_admin() وهي تصدق لأيّ صفٍّ في admins **بأيّ دور بما فيه «قارئ»**.
--  فتُضيَّق إلى is_editor()، ويبقى الحذف للمالك.
drop policy if exists "audit admin read"   on public.audit_log;
drop policy if exists "audit editor read"  on public.audit_log;
create policy "audit editor read" on public.audit_log
  for select to authenticated using (public.is_editor());

drop policy if exists "audit admin insert" on public.audit_log;
create policy "audit admin insert" on public.audit_log
  for insert to authenticated with check (public.is_admin());

drop policy if exists "audit admin delete" on public.audit_log;
drop policy if exists "audit owner delete" on public.audit_log;
create policy "audit owner delete" on public.audit_log
  for delete to authenticated using (public.is_owner());

--  التحقّق داخل الدوالّ نفسها، فمنحُ التنفيذ للمُصادَقين آمن
grant execute on function public.undo_change(bigint)  to authenticated;
grant execute on function public.undo_batch(bigint)   to authenticated;
grant execute on function public.purge_audit(int)     to authenticated;

-- ═════════════════════ ٧) منظر السجلّ للواجهة ═════════════════════
--  يحمل can_undo محسوبًا بنفس شروط الدالّة، فترسم اللوحة الزرَّ أو تُعطّله
--  بلا نداءٍ إضافيّ لكل صفّ.
drop view if exists public.v_audit_recent cascade;
create view public.v_audit_recent with (security_invoker = true) as
select a.id, a.created_at, a.actor_email, a.action, a.entity, a.entity_id,
       a.detail, a.pk, a.txid, a.undone_at, a.undone_by, a.undo_of, a.skipped,
       (a.old_row is not null) as has_old,
       (select count(*) from public.audit_log b
         where b.entity = a.entity
           and b.entity_id is not distinct from a.entity_id
           and b.created_at > a.created_at
           and b.undo_of is null)::int as later_edits,
       (a.undone_at is null
        and a.undo_of is null
        and a.skipped is null
        and a.pk is not null
        and (a.action = 'insert' or a.old_row is not null)
        and not exists (select 1 from public.audit_log c
                         where c.entity = a.entity
                           and c.entity_id is not distinct from a.entity_id
                           and c.created_at > a.created_at
                           and c.undo_of is null)) as can_undo
  from public.audit_log a;

grant select on public.v_audit_recent to authenticated;

-- ============================================================================
--  تحقّق بعد التشغيل
-- ============================================================================
select 'أعمدة الشريحة الجديدة' as البند,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'hero_slides'
           and column_name in ('bg_image', 'bg_overlay')) as القيمة
union all
select 'أعمدة السجلّ الجديدة',
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'audit_log'
           and column_name in ('old_row','new_row','pk','txid','undone_at',
                               'undone_by','undo_of','skipped'))
union all
select 'المُشغِّلات المُركَّبة',
       (select count(*)::text from pg_trigger
         where tgname like '%\_audit' and not tgisinternal)
union all
select 'دوالّ التراجع',
       (select string_agg(proname, ' · ' order by proname) from pg_proc
         where pronamespace = 'public'::regnamespace
           and proname in ('undo_change','undo_batch','purge_audit'))
union all
select 'منظر السجلّ',
       (select count(*)::text from information_schema.views
         where table_schema = 'public' and table_name = 'v_audit_recent')
union all
select 'قيودٌ قابلةٌ للتراجع الآن',
       (select count(*)::text from public.v_audit_recent where can_undo);
-- ============================================================================
