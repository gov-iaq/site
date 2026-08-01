-- ============================================================================
--  جمعية حاضنة الجمعيات — الإضافة السادسة للمخطّط
--  عناصر القائمة الرئيسية: تسميةٌ ورابطٌ وترتيبٌ وظهور، بمستويين.
--
--  المفتاح mkey يطابق data-mk في القائمة المبنيّة: فيُستنسخ العنصر المبنيّ
--  صاحب المفتاح نفسه عند إعادة البناء، فتُحفظ أيقونته وأصنافه.
--
--  شغّله في:  Supabase → SQL Editor → New query → Run
--  آمن للتشغيل أكثر من مرة (البذرة على مفتاح فريد لا تُكرَّر).
-- ============================================================================

create table if not exists public.menu_items (
  id         bigserial primary key,
  mkey       text not null,                 -- يطابق data-mk في القائمة المبنيّة
  parent     text not null default '',      -- مفتاح الأب، وفراغٌ للعنصر الرئيس
  label      text not null,
  href       text not null default '',      -- فارغ لعنصرٍ يفتح منسدلة فقط
  sort       int  not null default 100,
  visible    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists menu_items_key_idx on public.menu_items (mkey);
create index if not exists menu_items_order_idx on public.menu_items (parent, sort, id);

alter table public.menu_items enable row level security;

drop policy if exists "menu public read" on public.menu_items;
create policy "menu public read" on public.menu_items
  for select to anon, authenticated using (true);

drop policy if exists "menu admin write" on public.menu_items;
create policy "menu admin write" on public.menu_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists menu_items_touch on public.menu_items;
create trigger menu_items_touch before update on public.menu_items
  for each row execute function public.touch_updated_at();

-- ─────────────── بذرة: القائمة الحالية كما هي في الموقع ───────────────
insert into public.menu_items (mkey,parent,label,href,sort,visible)
values
  ('index','','الرئيسية','index.html',10,true),
  ('dd1','','من نحن','',20,true),
  ('about','dd1','عن الجمعية','about.html',10,true),
  ('assembly','dd1','الجمعية العمومية','assembly.html',20,true),
  ('board','dd1','مجلس الإدارة','board.html',30,true),
  ('committees','dd1','اللجان الفرعية','committees.html',40,true),
  ('team','dd1','فريق العمل','team.html',50,true),
  ('endowments','dd1','الأوقاف والاستثمارات','endowments.html',60,true),
  ('licenses','dd1','التراخيص','licenses.html',70,true),
  ('programs','','برامجنا','programs.html',30,true),
  ('news','','أخبارنا','news.html',40,true),
  ('dd2','','الحوكمة','',50,true),
  ('governance','dd2','السياسات واللوائح','governance.html',10,true),
  ('governance-2','dd2','محاضر الاجتماعات','governance.html',20,true),
  ('governance-3','dd2','القوائم المالية','governance.html',30,true),
  ('governance-4','dd2','التقارير السنوية','governance.html',40,true),
  ('governance-5','dd2','الإفصاح','governance.html',50,true),
  ('dd3','','قياس الرضا','',60,true),
  ('satisfaction','dd3','قياس رضا الزوار','satisfaction.html',10,true),
  ('satisfaction-2','dd3','قياس رضا المستفيدين','satisfaction.html',20,true),
  ('satisfaction-3','dd3','قياس رضا الداعمين','satisfaction.html',30,true),
  ('satisfaction-4','dd3','تقرير التغذية الراجعة','satisfaction.html',40,true),
  ('dd4','','الخدمات','',70,true),
  ('volunteer','dd4','تطوّع معنا','volunteer.html',10,true),
  ('membership','dd4','طلب العضوية','membership.html',20,true),
  ('jobs','dd4','الوظائف','jobs.html',30,true),
  ('contact','','تواصل معنا','contact.html',80,true)
on conflict (mkey) do nothing;

-- ============================================================================
--  تحقّق بعد التشغيل:
--    select parent, sort, mkey, label, href, visible
--      from public.menu_items order by parent, sort, id;
-- ============================================================================
