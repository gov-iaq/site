-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الثامنة للمخطّط
--  إحصاءات دقيقة: زيارات الصفحات والملفّات، وسجلّ عمل المدراء، ومؤشّرات الردّ.
--
--  ثلاثة قرارات في التصميم تستحقّ البيان:
--
--  ١) لا معرّف زائر ولا كوكيز ولا حفظ IP. نسجّل المسار والنوع ومصدر الزيارة
--     ونوع الجهاز واليوم فقط. فلا بيانات شخصية أصلًا — وهذا يُبقي الموقع في
--     سلامة نظام حماية البيانات الشخصية بلا شريط موافقة. والثمن أننا نعرف
--     «عدد الزيارات» لا «عدد الزوّار الفريدين».
--
--  ٢) PostgREST لا يدعم GROUP BY. فلو قرأت اللوحة الصفوف الخام لجمعها في
--     المتصفّح لَنقلت مئات الآلاف من الصفوف. لذا كل تجميعٍ يجري في «منظر»
--     مُعدٌّ سلفًا، مبوّبًا باليوم — فتقرأ اللوحة عشرات الصفوف لا آلافها،
--     وتختار المدى الزمني بترشيح اليوم.
--
--  ٣) سجلّ العمل مُشغِّلات في القاعدة لا نداءات من اللوحة: فلا يمكن تجاوزه،
--     ولا يُنسى، ويسجّل الفاعل من رمز الجلسة تلقائيًّا. والمُشغِّل يُخفق بصمت
--     إن تعذّر التسجيل — فلا يمنع خطأٌ في السجلّ حفظَ محتوًى.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة.
-- ============================================================================

-- ═════════════════════ ١) زيارات الصفحات والملفّات ═════════════════════
create table if not exists public.page_views (
  id        bigserial primary key,
  ts        timestamptz not null default now(),
  day       date not null default (now() at time zone 'Asia/Riyadh')::date,
  kind      text not null default 'page'
              check (kind in ('page','file_dl','file_view','cta','form','contact')),
  path      text not null default '',        -- اسم الصفحة (السبيكة)
  label     text not null default '',        -- اسم الملفّ أو الزرّ أو النموذج
  ref_host  text not null default '',        -- مضيف مصدر الزيارة، أو '' مباشرة
  device    text not null default ''          -- mobile | tablet | desktop
              check (device in ('','mobile','tablet','desktop'))
);

-- حدودٌ تمنع إفساد الجدول بنصوصٍ طويلة (الإدراج مفتوح للزائر بالضرورة)
alter table public.page_views drop constraint if exists page_views_len;
alter table public.page_views add constraint page_views_len check (
  length(path) <= 120 and length(label) <= 160 and length(ref_host) <= 120
);

create index if not exists page_views_day_idx   on public.page_views (day);
create index if not exists page_views_kind_idx  on public.page_views (kind, day);
create index if not exists page_views_path_idx  on public.page_views (path, day);

alter table public.page_views enable row level security;

--  الزائر يُدرج ولا يقرأ. ولو قرأ لَكشف حركة الموقع كلها.
drop policy if exists "views public insert" on public.page_views;
create policy "views public insert" on public.page_views
  for insert to anon, authenticated with check (true);

drop policy if exists "views staff read" on public.page_views;
create policy "views staff read" on public.page_views
  for select to authenticated using (public.is_admin());

drop policy if exists "views owner delete" on public.page_views;
create policy "views owner delete" on public.page_views
  for delete to authenticated using (public.is_owner());

-- ═════════════════════ ٢) سجلّ العمل: عمودٌ للتفصيل ═════════════════════
alter table public.audit_log add column if not exists detail jsonb;
create index if not exists audit_day_idx on public.audit_log (created_at);
create index if not exists audit_actor_idx on public.audit_log (actor_email, created_at);

-- ═════════════════════ ٣) مُشغِّل التسجيل العامّ ═════════════════════
create or replace function public.log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who   text := lower(coalesce(auth.jwt() ->> 'email', ''));
  act   text;
  eid   text;
  det   jsonb := null;
begin
  begin
    if tg_op = 'INSERT' then
      act := 'insert';
      eid := coalesce((to_jsonb(new) ->> 'id'), '');
    elsif tg_op = 'DELETE' then
      act := 'delete';
      eid := coalesce((to_jsonb(old) ->> 'id'), '');
      det := jsonb_build_object('label', left(coalesce(
               to_jsonb(old) ->> 'title', to_jsonb(old) ->> 'name',
               to_jsonb(old) ->> 'label', to_jsonb(old) ->> 'email', ''), 80));
    else
      act := 'update';
      eid := coalesce((to_jsonb(new) ->> 'id'), '');
      --  تغيّر الحالة يُسجَّل صراحةً: منه تُحسب مؤشّرات الردّ
      if (to_jsonb(old) ? 'status') and
         (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status') then
        act := 'status';
        det := jsonb_build_object('from', to_jsonb(old) ->> 'status',
                                  'to',   to_jsonb(new) ->> 'status');
      end if;
    end if;

    insert into public.audit_log (actor_email, action, entity, entity_id, detail)
    values (nullif(who, ''), act, tg_table_name, nullif(eid, ''), det);
  exception when others then
    --  السجلّ لا يمنع العمل: خطأٌ فيه يُهمَل ويبقى الحفظ
    null;
  end;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

--  يُركَّب على كل جدولٍ يُحرّره المدير
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

-- ═════════════════════ ٤) مناظر التجميع ═════════════════════
--  كلها مبوّبة باليوم: تختار اللوحة المدى بترشيح day، وتجمع عشرات الصفوف.
--  و security_invoker يُبقي حماية الصفوف سارية — فلا يقرأها إلا مُصرَّح له.

drop view if exists public.v_views_daily cascade;
create view public.v_views_daily with (security_invoker = true) as
  select day, kind, count(*)::bigint as n
    from public.page_views group by day, kind;

drop view if exists public.v_views_by_path cascade;
create view public.v_views_by_path with (security_invoker = true) as
  select day, kind, path, count(*)::bigint as n
    from public.page_views where path <> '' group by day, kind, path;

drop view if exists public.v_views_by_label cascade;
create view public.v_views_by_label with (security_invoker = true) as
  select day, kind, label, count(*)::bigint as n
    from public.page_views where label <> '' group by day, kind, label;

drop view if exists public.v_views_by_ref cascade;
create view public.v_views_by_ref with (security_invoker = true) as
  select day, ref_host, count(*)::bigint as n
    from public.page_views where kind = 'page' group by day, ref_host;

drop view if exists public.v_views_by_device cascade;
create view public.v_views_by_device with (security_invoker = true) as
  select day, device, count(*)::bigint as n
    from public.page_views where kind = 'page' group by day, device;

--  خريطة الذروة: يوم الأسبوع × الساعة بتوقيت الرياض (٧×٢٤ صفًّا على الأكثر)
drop view if exists public.v_views_hourly cascade;
create view public.v_views_hourly with (security_invoker = true) as
  select extract(dow  from ts at time zone 'Asia/Riyadh')::int as dow,
         extract(hour from ts at time zone 'Asia/Riyadh')::int as hour,
         count(*)::bigint as n
    from public.page_views where kind = 'page'
   group by 1, 2;

drop view if exists public.v_audit_daily cascade;
create view public.v_audit_daily with (security_invoker = true) as
  select (created_at at time zone 'Asia/Riyadh')::date as day,
         coalesce(actor_email, '(غير معروف)') as actor_email,
         action, entity, count(*)::bigint as n
    from public.audit_log
   group by 1, 2, 3, 4;

--  مؤشّرات الردّ: من وصول الطلب إلى أوّل تغيير حالة، ثم إلى إغلاقه.
drop view if exists public.v_subs_response cascade;
create view public.v_subs_response with (security_invoker = true) as
  select s.id,
         s.kind,
         s.status,
         s.created_at,
         (s.created_at at time zone 'Asia/Riyadh')::date as day,
         f.first_at,
         c.closed_at,
         case when f.first_at is not null
              then round(extract(epoch from (f.first_at - s.created_at)) / 3600.0, 2)
         end as hours_to_first,
         case when c.closed_at is not null
              then round(extract(epoch from (c.closed_at - s.created_at)) / 3600.0, 2)
         end as hours_to_close
    from public.submissions s
    left join (
      select entity_id, min(created_at) as first_at
        from public.audit_log
       where entity = 'submissions' and action = 'status'
       group by entity_id
    ) f on f.entity_id = s.id::text
    left join (
      select entity_id, min(created_at) as closed_at
        from public.audit_log
       where entity = 'submissions' and action = 'status'
         and detail ->> 'to' = 'closed'
       group by entity_id
    ) c on c.entity_id = s.id::text;

grant select on public.v_views_daily, public.v_views_by_path, public.v_views_by_label,
                public.v_views_by_ref, public.v_views_by_device, public.v_views_hourly,
                public.v_audit_daily, public.v_subs_response
  to authenticated;

-- ============================================================================
--  تحقّق بعد التشغيل
-- ============================================================================
select 'جدول الزيارات' as البند, count(*)::text as القيمة from public.page_views
union all
select 'سجلّ العمل', count(*)::text from public.audit_log
union all
select 'المُشغِّلات المُركَّبة',
       (select count(*)::text from pg_trigger
         where tgname like '%\_audit' and not tgisinternal)
union all
select 'المناظر',
       (select string_agg(table_name, ' · ' order by table_name)
          from information_schema.views
         where table_schema = 'public' and table_name like 'v\_%');
-- ============================================================================
