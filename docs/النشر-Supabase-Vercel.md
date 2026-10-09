# نشر منصة القوائم على Supabase + Vercel (للتجربة الحالية)

| الجزء | أين يعمل |
|---|---|
| قاعدة البيانات (PostgreSQL) | Supabase |
| صور القوائم (الشعار، الغلاف، صور الأصناف) | Supabase Storage (مجلد عام يُنشأ تلقائيًا) |
| الموقع نفسه (صفحات الزبائن + لوحة التحكم + واجهة نقطة البيع) | Vercel |

> Supabase لا يشغّل مواقع Next.js، لذلك يُرفع الموقع على Vercel ويتصل بقاعدة Supabase. كلاهما مجاني للتجربة.

---

## 1) Supabase: إنشاء المشروع

1. ادخل إلى <https://supabase.com> ← **New project**.
   - **Region**: `Central EU (Frankfurt)` (الأقرب للأردن، ويطابق منطقة Vercel في `vercel.json`).
   - **Database Password**: كلمة قوية، واحفظها عندك.
2. بعد اكتمال الإنشاء اضغط **Connect** (أعلى الصفحة) ← اختر **Session pooler** ← انسخ الرابط، وهو بهذا الشكل:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   ثم ضع كلمة مرور القاعدة مكان `[YOUR-PASSWORD]`. هذا هو `DATABASE_URL`.
   - ⚠️ لا تستخدم **Transaction pooler** (المنفذ 6543).
3. من **Project Settings ← API** انسخ:
   - **Project URL**، وهو `SUPABASE_URL`.
   - مفتاح **service_role** (السري)، وهو `SUPABASE_SERVICE_ROLE_KEY`. لا تشاركه مع أحد ولا تضعه في أي صفحة.

لا حاجة لإنشاء جداول أو مجلد صور يدويًا: الجداول تُنشأ عند أول تشغيل، ومجلد الصور `menu-media` يُنشأ عند أول رفع.

## 2) Vercel: رفع الموقع

الطريقة الأسهل، من الجهاز مباشرة وبدون GitHub:

```bash
cd /d D:\PRO-MENU
npx vercel login
npx vercel link
```

(`link` ينشئ المشروع؛ اقبل الإعدادات المقترحة: Next.js، والمجلد الحالي.)

ثم من لوحة Vercel ← المشروع ← **Settings ← Environment Variables** أضف المتغيرات التالية لبيئة **Production** (القالب الكامل في `.env.vercel.example`):

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط Session pooler من الخطوة 1 |
| `DB_SSL` | `no-verify` |
| `DB_POOL_SIZE` | `2` |
| `AUTO_MIGRATE` | `true` |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح service_role |
| `SUPABASE_BUCKET` | `menu-media` |
| `APP_SECRET` | 48 حرفًا عشوائيًا على الأقل (انظر الأمر أدناه). **لا تغيّره بعد التشغيل الأول** |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | حساب المدير الأول (كلمة المرور 12 حرفًا على الأقل) |
| `PUBLIC_BASE_URL` | اتركه فارغًا الآن (يُستخدم عنوان vercel.app تلقائيًا) |

لتوليد `APP_SECRET` في PowerShell:

```bash
powershell -c "[Convert]::ToBase64String((1..48|%{Get-Random -Max 256}))"
```

بعدها انشر:

```bash
npx vercel --prod
```

سيظهر رابط مثل `https://pro-menu-xxxx.vercel.app`.

## 3) أول دخول والتحقق

1. افتح `https://<الرابط>/admin` وادخل بالبريد وكلمة المرور.
2. فعّل **التحقق بخطوتين** فورًا من **الإعدادات ← الأمان**.
3. احذف المتغير `ADMIN_PASSWORD` من Vercel، فهو لم يعد مطلوبًا.
4. أنشئ مطعمًا ← اجعل حالته **فعّال** ← حدد موقعه على الخريطة ونطاقه ← **رمز ربط نقطة البيع**.
5. في نقطة البيع: **الإعدادات ← المطعم ← الطاولات وطلبات QR ← ربط**. أدخل رابط المنصة (رابط vercel.app) والرمز.
6. أضف الطاولات واطبع بطاقة QR، ثم امسحها بالجوال واطلب طلبًا تجريبيًا.

## 4) ربط النطاق menu.sitekoom.com (عندما تجهز)

1. Vercel ← المشروع ← **Settings ← Domains** ← أضف `menu.sitekoom.com`.
2. عند مزوّد النطاق أضف سجل **CNAME**: الاسم `menu`، والقيمة `cname.vercel-dns.com`. شهادة HTTPS تصدر تلقائيًا.
3. ضع `PUBLIC_BASE_URL=https://menu.sitekoom.com` ثم أعد النشر (`npx vercel --prod`).
4. في نقطة البيع غيّر رابط المنصة إلى النطاق الجديد، **وأعد طباعة بطاقات الطاولات** (الروابط القديمة على vercel.app تبقى تعمل ما دام المشروع قائمًا).

روابط المطاعم بعد ذلك: `menu.sitekoom.com/res1`، والطاولات `menu.sitekoom.com/res1/t/...`.

## تحديث الموقع لاحقًا

```bash
cd /d D:\PRO-MENU
npx vercel --prod
```

تحديثات قاعدة البيانات تُطبّق تلقائيًا عند التشغيل، وهي إضافات فقط.

## ملاحظات مهمة

- **خطة Vercel المجانية (Hobby)** مخصصة للاستخدام غير التجاري، وهي مناسبة للتجربة. عند تشغيل مطاعم مشتركة فعلًا انتقل إلى **Pro**، أو إلى خادم VPS بملف `docker-compose.yml` الموجود (انظر `DEPLOYMENT.md`).
- **مشروع Supabase المجاني** يتوقف مؤقتًا بعد أسبوع بلا أي نشاط. ما دامت نقطة بيع متصلة فلن يتوقف.
- **وصول الطلب للكاشير:** عادةً خلال ثوانٍ، وقد يصل التأخير إلى 5 ثوانٍ تقريبًا، لأن كل طلب على Vercel قد يُخدم من نسخة مختلفة.
- **حدود المحاولات:** الحماية من كثرة الطلبات تُحسب داخل كل نسخة على Vercel، فهي أضعف قليلًا من خادم واحد. أما قفل حساب المدير بعد 5 محاولات خاطئة فمحفوظ في القاعدة ويعمل دائمًا.
- **الأسرار** (`SUPABASE_SERVICE_ROLE_KEY`، `APP_SECRET`، كلمة مرور القاعدة) توضع في Vercel فقط، ولا تُرسل لأحد.
