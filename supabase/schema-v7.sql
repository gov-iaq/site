-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة السابعة للمخطّط
--  الأدوار تصير حقيقية، وإدارة المدراء من اللوحة.
--
--  ما كان: دالّة is_admin() تتحقّق من وجود البريد في جدول المدراء ولا تنظر
--  إلى عمود role إطلاقًا. فمن دوره «قارئ» كان يكتب في كل شيء كصاحب الحساب.
--  وجدول المدراء له سياسة قراءةٍ واحدة لصفّ صاحب الجلسة، ولا سياسة كتابة —
--  فلا تُدار الحسابات إلا بـSQL.
--
--  ما يصير:
--    is_admin()   وجود البريد في الجدول بأي دور  →  القراءة (كما هي)
--    is_editor()  الدور admin أو editor          →  كل كتابة
--    is_owner()   الدور admin وحده                →  إدارة المدراء
--
--  ولماذا بقيت is_admin() للقراءة على حالها: لو قصرتُها على الكاتبين لَفقد
--  «القارئ» حقَّ القراءة فترفض اللوحة العمل عنده. وهذا الترتيب آمنٌ عند
--  التطبيق الجزئي: لو تعذّر تنفيذ نصف الملف لم يفقد أحدٌ حقَّ القراءة.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة.
-- ============================================================================

-- ─────────────────────── 1) دالّتا الأدوار ───────────────────────
create or replace function public.is_editor()
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

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a
     where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       and a.role = 'admin'
  );
$$;

-- ─────────────── 2) كل سياسات الكتابة تصير للكاتبين ───────────────
--  (19 سياسة — القراءة تبقى كما هي فلا يفقد القارئ شيئًا)

-- settings
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- content_overrides
drop policy if exists "overrides admin write" on public.content_overrides;
create policy "overrides admin write" on public.content_overrides
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- media
drop policy if exists "media admin write" on public.media;
create policy "media admin write" on public.media
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- people
drop policy if exists "people admin write" on public.people;
create policy "people admin write" on public.people
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- partners
drop policy if exists "partners admin write" on public.partners;
create policy "partners admin write" on public.partners
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- hero_slides
drop policy if exists "hero admin write" on public.hero_slides;
create policy "hero admin write" on public.hero_slides
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- menu_items
drop policy if exists "menu admin write" on public.menu_items;
create policy "menu admin write" on public.menu_items
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- news
drop policy if exists "news admin insert" on public.news;
create policy "news admin insert" on public.news
  for insert to authenticated with check (public.is_editor());
drop policy if exists "news admin update" on public.news;
create policy "news admin update" on public.news
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists "news admin delete" on public.news;
create policy "news admin delete" on public.news
  for delete to authenticated using (public.is_editor());

-- documents
drop policy if exists "docs admin all" on public.documents;
create policy "docs admin all" on public.documents
  for all to authenticated using (public.is_editor()) with check (public.is_editor());
--  الوثائق كانت بلا سياسة قراءةٍ للموظّفين: القارئ يرى المنشور وحده.
drop policy if exists "docs staff read" on public.documents;
create policy "docs staff read" on public.documents
  for select to authenticated using (public.is_admin());

-- submissions
drop policy if exists "subs admin update" on public.submissions;
create policy "subs admin update" on public.submissions
  for update to authenticated using (public.is_editor()) with check (public.is_editor());
drop policy if exists "subs admin delete" on public.submissions;
create policy "subs admin delete" on public.submissions
  for delete to authenticated using (public.is_editor());

-- survey_responses
drop policy if exists "survey admin delete" on public.survey_responses;
create policy "survey admin delete" on public.survey_responses
  for delete to authenticated using (public.is_editor());

-- audit_log  (الإدراج يبقى لأي موظّف كي يُسجَّل عملُه)
drop policy if exists "audit admin delete" on public.audit_log;
create policy "audit admin delete" on public.audit_log
  for delete to authenticated using (public.is_owner());

-- التخزين: رفع الملفات وحذفها للكاتبين
drop policy if exists "iaq buckets admin insert" on storage.objects;
create policy "iaq buckets admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

drop policy if exists "iaq buckets admin update" on storage.objects;
create policy "iaq buckets admin update" on storage.objects
  for update to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_editor())
  with check (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

drop policy if exists "iaq buckets admin delete" on storage.objects;
create policy "iaq buckets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('iaq-files','iaq-media') and public.is_editor());

-- ─────────────── 3) إدارة المدراء: للمالك وحده ───────────────
--  صفّ صاحب الجلسة يبقى مقروءًا له دائمًا (اللوحة تحتاجه للتحقّق).
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));

drop policy if exists "admins owner read" on public.admins;
create policy "admins owner read" on public.admins
  for select to authenticated using (public.is_owner());

drop policy if exists "admins owner insert" on public.admins;
create policy "admins owner insert" on public.admins
  for insert to authenticated with check (public.is_owner());

drop policy if exists "admins owner update" on public.admins;
create policy "admins owner update" on public.admins
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "admins owner delete" on public.admins;
create policy "admins owner delete" on public.admins
  for delete to authenticated using (public.is_owner());

-- ─────────────── 4) حرزٌ يمنع إقفال الحساب على أهله ───────────────
--  حذف آخر مالكٍ أو تنزيل دوره يترك النظام بلا من يديره ولا من يكتب فيه —
--  ولا يُصلَح ذلك إلا من لوحة Supabase. فيُمنع في القاعدة نفسها.
create or replace function public.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owners int;
begin
  select count(*) into owners from public.admins where role = 'admin';

  if tg_op = 'DELETE' then
    if old.role = 'admin' and owners <= 1 then
      raise exception 'لا يمكن حذف المالك الأخير — أضِف مالكًا آخر أوّلًا.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'admin' and new.role <> 'admin' and owners <= 1 then
      raise exception 'لا يمكن تنزيل دور المالك الأخير — أضِف مالكًا آخر أوّلًا.';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists admins_guard on public.admins;
create trigger admins_guard before update or delete on public.admins
  for each row execute function public.guard_last_owner();

-- ============================================================================
--  تحقّق بعد التشغيل:
--
--  1) الدوالّ الثلاث موجودة:
--       select proname from pg_proc
--        where proname in ('is_admin','is_editor','is_owner') order by 1;
--
--  2) دورك يسمح بالكتابة وبإدارة المدراء:
--       select public.is_admin() as يقرأ,
--              public.is_editor() as يكتب,
--              public.is_owner() as يدير;
--       -- المتوقّع لحسابك (role=admin): true, true, true
--
--  3) الحرز يعمل — يجب أن يفشل هذا بخطأٍ واضح ما دمتَ المالك الوحيد:
--       -- delete from public.admins where email = 'gov@iaq.org.sa';
--
--  4) عدد سياسات الكتابة التي صارت للكاتبين:
--       select count(*) from pg_policies
--        where qual like '%is_editor%' or with_check like '%is_editor%';
-- ============================================================================
