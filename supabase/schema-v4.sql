-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة الرابعة للمخطّط  (اختيارية)
--
--  اللوحة تعمل كاملةً بدون هذا الملف. تشغيله يضيف ميزتين فقط:
--    1) عمود ترتيب للوثائق، فيتحكّم المدير بترتيب ظهورها داخل كل تبويب.
--    2) توثيق آخر من عدّل (updated_by) وآخر وقت تعديل (updated_at) للوثائق
--       والأخبار.
--
--  ولا يحتاج تشغيلُه تعديلًا في الكود: شاشة الوثائق تطلب الأعمدة الموجودة
--  فعلًا (select=*) وتُظهر حقل «الترتيب» وحدها بمجرّد وجود العمود.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة. يفترض تشغيل schema.sql و schema-v2.sql و
--  schema-v3.sql قبله.
-- ============================================================================

-- ───────────────────── 1) ترتيب الوثائق داخل تبويبها ─────────────────────
alter table public.documents add column if not exists sort int not null default 100;

-- الترتيب الحالي مأخوذ من ترتيب التحميل: نُثبّته بفواصل عشرة كي يسهل
-- إدخال وثيقة بين وثيقتين لاحقًا بلا إعادة ترقيم الجميع.
update public.documents d
   set sort = x.n * 10
  from (select id, row_number() over (partition by category order by id) as n
          from public.documents) x
 where d.id = x.id
   and d.sort = 100;

create index if not exists documents_order_idx on public.documents (category, sort, id);

-- ───────────────────── 2) توثيق التعديل: مَن ومتى ─────────────────────
alter table public.documents add column if not exists updated_at timestamptz not null default now();
alter table public.documents add column if not exists updated_by text;
alter table public.news      add column if not exists updated_by text;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

-- الأخبار لها زرّ updated_at ومُشغّله من schema.sql؛ نتحقّق فقط من وجوده
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.news'::regclass
       and tgname  = 'news_touch'
       and not tgisinternal
  ) then
    create trigger news_touch before update on public.news
      for each row execute function public.touch_updated_at();
  end if;
end $$;

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select category, sort, title from public.documents order by category, sort, id;
--    select column_name from information_schema.columns
--      where table_name='documents' and column_name in ('sort','updated_at','updated_by');
-- ============================================================================
