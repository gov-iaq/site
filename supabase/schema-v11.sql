-- ============================================================================
--  حاضنة الجمعيات — الترقية الحادية عشرة: أرقامُ الزوّار لا تُلفَّق بحرّية
--
--  إدراجُ الزيارات مفتوحٌ للزائر بالضرورة (لا حساب، ولا كوكيز، ولا معرّف).
--  لكنّه كان مفتوحًا **بلا قيد**: with check (true) على كل الأعمدة. وهذا
--  يعني ثلاثةَ أبوابٍ لا واحدًا:
--
--    ١) تلفيقُ التاريخ: العميل لا يُرسل day ولا ts أبدًا (iaq-track.js:67-73)،
--       فتعمل القيمُ الافتراضية. لكنّ من أراد أرسلهما بأيّ قيمة — فيُدرج
--       زياراتٍ في المستقبل أو في ماضٍ سابقٍ لوجود الموقع، فتُسمّم الرسوم
--       والمقارنات كلُّها ولا يُكشف ذلك من اللوحة.
--    ٢) تعطيلُ الإحصاء بالكامل: id عمودُ bigserial، ومن أدرج فيه صريحًا رقمًا
--       كبيرًا (مثل 10^18) لم يتحرّك المُتوالي — فكلُّ إدراجٍ لاحقٍ ينكسر
--       بتعارض المفتاح. سطرٌ واحدٌ يُسكت المنارةَ إلى الأبد.
--    ٣) التضخيم: لا سقفَ لعددِ الصفوف، فلا حدَّ لحجمِ الكذبة ولا للتخزين.
--
--  والسدّ ثلاثيٌّ بمقدارِ الأبواب. أمّا الثالث فيُقيَّد ولا يُمنَع: بلا معرّفِ
--  زائرٍ لا يمكن أن يصير الرقمُ غيرَ قابلٍ للتلفيق — فالواجبُ أن نحدَّ حجمَ
--  الكذبة، **وأن تُعلن اللوحةُ عن اليوم الذي بلغ السقف** بدل أن تعرض رقمًا
--  مبلوغًا كأنّه قياس. صمتُ اللوحة هو الكذبُ لا السقفُ نفسه.
--
--  يُشغَّل بعد setup.sql و schema-v8 و v9 و v10.  إضافيٌّ وقابلٌ لإعادة التشغيل.
-- ============================================================================

-- ═════════ ١) البابان الأوّل والثاني: صلاحيةٌ على الأعمدة لا على الجدول ═════════
--
--  أنظفُ من فحصٍ في السياسة: ما لا يملك الزائرُ صلاحيةَ الكتابةِ فيه لا يستطيع
--  إرسالَه أصلًا، وتعمل قيمتُه الافتراضية (القيمُ الافتراضية تُطبَّق بصرف النظر
--  عن صلاحية العمود). فالوقتُ والتاريخُ والمفتاحُ من عند القاعدة وحدها.
revoke insert on public.page_views from anon, authenticated;
grant  insert (kind, path, label, ref_host, device)
  on public.page_views to anon, authenticated;

--  المُتوالي يحتاج صلاحيةَ استعمالٍ كي تعمل القيمةُ الافتراضية للمفتاح
grant usage, select on sequence public.page_views_id_seq to anon, authenticated;

-- ═════════ ٢) البابُ الثالث: سقفٌ يومٌّي وسقفُ دفعة ═════════
--
--  السقفُ اليوميّ سخيٌّ بأضعافٍ عن أيّ حركةٍ واقعيةٍ لموقع جمعيةٍ محليّة، وهو
--  في الوقت نفسه حدٌّ صارمٌ لحجم التخزين ولحجم أيّ تضخيمٍ مقصود.
create or replace function public.views_day_cap()
returns int language sql immutable as $$ select 5000 $$;

--  الفحصُ بـ exists/offset لا بـ count(*): يتوقّف عند الصفّ رقم السقف+١ فلا
--  يمسح الجدولَ كلَّه في كل إدراج.
--  السقفُ **لكلّ نوعٍ** لا للجدول كلّه: بلا معرّفِ زائرٍ لا يمكن أن يصير
--  الرقمُ غيرَ قابلٍ للتلفيق، لكنّ فصلَ الأنواع يمنع أن يُسكِت سيلٌ من نوعٍ
--  واحدٍ بقيّةَ الأنواع. فمن يُغرق 'page' لا يمنع تسجيلَ 'form' ولا 'file_dl'
--  — وهي الأحداثُ التي تُتّخذ بها قرارات.
--
--  والقيدُ الباقي يُقال صريحًا ولا يُخفى: يومٌ أُغرق يُعرض رقمُه حدًّا لا
--  قياسًا، واللوحةُ تُعلن ذلك من v_views_health. والحلُّ التامُّ يحتاج مَن
--  يرى عنوانَ الزائر — أي مُستقبِلًا في عامل Cloudflare لا في القاعدة.
--  السياسةُ تُسقَط أوّلًا: على إعادة التشغيل تكون السياسةُ القائمةُ مُعتمِدةً
--  على التوقيع القديم بلا معامل، فلا يُسقَط ذلك التوقيعُ وهي قائمة.
drop policy if exists "views public insert" on public.page_views;
drop function if exists public.views_rate_ok();

create or replace function public.views_rate_ok(k text)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  select not exists (
           select 1 from public.page_views
            where ts > now() - interval '10 seconds'
            offset 60 limit 1)
     and not exists (
           select 1 from public.page_views
            where day = (now() at time zone 'Asia/Riyadh')::date
              and kind = k
            offset public.views_day_cap() limit 1);
$$;

grant execute on function public.views_rate_ok(text) to anon, authenticated;
grant execute on function public.views_day_cap()  to anon, authenticated, service_role;

--  فهرسُ ts للدفعة. وفحصُ السقف اليوميّ يستعمل page_views_kind_idx (kind, day)
--  المُنشأ في schema-v8 — فلا فهرسَ جديدٌ له.
create index if not exists page_views_ts_idx on public.page_views (ts desc);

create policy "views public insert" on public.page_views
  for insert to anon, authenticated
  with check (public.views_rate_ok(kind));

-- ═════════ ٣) الاحتفاظ: التخزين محدودٌ بزمنٍ لا بحسنِ النيّة ═════════
--  نظيرةُ purge_audit. تُنادى يدويًّا أو من مهمّةٍ مجدولة (لا pg_cron هنا).
create or replace function public.purge_views(keep_days int default 400)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if not public.is_owner() then
    raise exception 'لصاحب الموقع وحده';
  end if;
  --  حدٌّ أدنى صارم: purge_views(0) كانت تمحو تاريخَ الإحصاء كلَّه بلا رجعةٍ
  --  ولا تأكيد — وصفرٌ يُكتب سهوًا. والدالّةُ للاحتفاظ لا للتصفير.
  if keep_days is null or keep_days < 30 then
    raise exception 'أقلُّ مدّةِ احتفاظٍ ٣٠ يومًا (طُلب: %). ولتصفيرِ الجدول اكتب delete صريحًا.', keep_days;
  end if;
  delete from public.page_views
   where day < ((now() at time zone 'Asia/Riyadh')::date - keep_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_views(int) from public;
grant execute on function public.purge_views(int) to authenticated;

-- ═════════ ٤) صحّةُ الإحصاء: اللوحةُ تعرف السقفَ فتُعلن بلوغَه ═════════
--
--  بلا هذا المنظر يكون السقفُ كذبةً ثانيةً: يومٌ بلغ ٥٠٠٠ يُعرض «٥٠٠٠ زيارة»
--  وهو في الحقيقة «٥٠٠٠ أو أكثر — وقد يكون تلفيقًا». اللوحةُ تقرأ من هنا
--  وتضع تنبيهًا فوق الرسم.
drop view if exists public.v_views_health cascade;
create view public.v_views_health with (security_invoker = true) as
  select public.views_day_cap()                                        as cap,
         (select count(*) from public.page_views
           where day = (now() at time zone 'Asia/Riyadh')::date)       as today,
         (select count(*) from public.page_views)                      as rows_total,
         (select min(day)  from public.page_views)                     as since_day,
         (select count(*)  from public.page_views p
           where p.day > (now() at time zone 'Asia/Riyadh')::date)     as future_rows,
         --  السقفُ لكلّ نوعٍ، فاليومُ «بلغ السقف» إن بلغه أيُّ نوعٍ فيه.
         --  واللوحةُ تقول صريحًا أنّ هذا محسوبٌ على كامل العمر لا على المدى
         --  المعروض، ومعه آخرُ يومٍ بلغه كي يُعرف موضعُه.
         --  distinct day: السقفُ لكلّ نوعٍ فقد يبلغه نوعان في يومٍ واحد،
         --  وعدُّ الأزواج كان يجعل يومًا واحدًا «يومين».
         (select count(distinct day) from (
            select day from public.page_views
             group by day, kind having count(*) >= public.views_day_cap()
          ) q)                                                        as capped_days,
         (select max(day) from (
            select day from public.page_views
             group by day, kind having count(*) >= public.views_day_cap()
          ) q2)                                                       as last_capped_day;

grant select on public.v_views_health to authenticated;

-- ============================================================================
--  تحقّق بعد التشغيل
-- ============================================================================
select 'أعمدةٌ يستطيع الزائرُ كتابتَها' as البند,
       (select string_agg(column_name, ' · ' order by column_name)
          from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'page_views'
           and grantee = 'anon' and privilege_type = 'INSERT') as القيمة
union all
select 'إدراجٌ على مستوى الجدول لـanon',
       (case when exists (
          select 1 from information_schema.table_privileges
           where table_schema = 'public' and table_name = 'page_views'
             and grantee = 'anon' and privilege_type = 'INSERT')
        then 'ما زال — أعِد التشغيل' else 'أُلغي ✓' end)
union all
select 'سياسةُ الإدراج',
       (select coalesce(string_agg(polname, ' · '), 'لا شيء')::text
          from pg_policy where polrelid = 'public.page_views'::regclass and polcmd = 'a')
union all
select 'السقفُ اليوميّ', public.views_day_cap()::text
union all
select 'صفوفُ اليوم / صفوفٌ في المستقبل / أيامٌ بلغت السقف',
       (select today || ' / ' || future_rows || ' / ' || capped_days from public.v_views_health)
union all
select 'إجمالي الصفوف · أقدمُ يوم',
       (select rows_total || ' · ' || coalesce(since_day::text, '—') from public.v_views_health);
-- ============================================================================
