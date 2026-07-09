# خريطة نشر DevLog AI

آخر فحص محلي: تم التحقق من ملفات JavaScript، JSON، روابط HTML المحلية، وملفات PWA الأساسية.

## ما الذي يحدث من الرفع حتى المستخدم

1. ترفع ملفات الواجهة إلى GitHub Pages أو أي استضافة static.
2. المتصفح يفتح `index.html` من رابط الإنتاج.
3. `index.html` يحمل `css/style.css` و `js/script.js`.
4. `script.js` يبدأ التطبيق، يسجل Service Worker، ويفعل الراوتر والواجهة.
5. المستخدم يسجل أو يدخل عبر Supabase Auth.
6. Supabase يطبق RLS، وكل مستخدم يرى بياناته فقط.
7. الإنجازات تحفظ في جدول `logs`.
8. صور الإنجازات ترفع إلى Bucket `log-images` وتعرض لاحقا عبر signed URLs.
9. صورة الحساب ترفع إلى Bucket `avatars`.
10. زر توليد المنشور يستدعي Edge Function باسم `generate-post`.
11. Edge Function تتحقق من جلسة المستخدم، تطبق حد 3 توليدات يوميا، ثم تستدعي Gemini عبر `GEMINI_API_KEY`.
12. المستخدم يرى المنشور ويحفظه، وبعدها يظهر في السجل.

## أوامر Supabase قبل الرفع

نفذها من مجلد المشروع:

~~~
cd "C:\Users\anas m aldahdouh\Desktop\‏‏MGX -DEV"
supabase.cmd login
supabase.cmd link --project-ref hhjppsogkzxiobbbcxic
supabase.cmd db push
supabase.cmd secrets set GEMINI_API_KEY="PUT_REAL_KEY_HERE"
supabase.cmd functions deploy generate-post
~~~

مهم: استخدم `supabase.cmd` في PowerShell لأن تشغيل `supabase.ps1` محظور عندك بسياسة Execution Policy.

## إعدادات Supabase Dashboard

تأكد من هذه القيم قبل مشاركة الرابط:

- Auth Site URL: `https://anasaldahdoh2005-commits.github.io/DevLog-AI/`
- Redirect URLs:
  - `https://anasaldahdoh2005-commits.github.io/DevLog-AI/`
  - `https://anasaldahdoh2005-commits.github.io/DevLog-AI/?auth=verified`
  - `https://anasaldahdoh2005-commits.github.io/DevLog-AI/?auth=recovery`
- Storage buckets المطلوبة:
  - `log-images`
  - `avatars`
- Edge Function المطلوبة:
  - `generate-post`
- Secret المطلوب:
  - `GEMINI_API_KEY`

## رفع الواجهة

إذا سترفع عبر GitHub:

~~~
git init
git add index.html css js imges manifest.webmanifest sw.js supabase package.json package-lock.json DEPLOYMENT_ROADMAP.md
git commit -m "Prepare DevLog AI launch"
git branch -M main
git remote add origin https://github.com/anasaldahdoh2005-commits/DevLog-AI.git
git push -u origin main
~~~

ثم من GitHub:

1. افتح Settings.
2. افتح Pages.
3. اختر Deploy from a branch.
4. اختر branch `main` والمجلد `/root`.
5. انتظر ظهور رابط GitHub Pages.

## فحص بعد النشر

افتح الرابط من نافذة خاصة ثم اختبر:

- الصفحة الرئيسية تفتح بدون شاشة بيضاء.
- إنشاء حساب جديد يعمل.
- تسجيل الدخول يعمل.
- إضافة إنجاز بدون AI تعمل.
- توليد منشور AI يعمل.
- حفظ منشور مولد يظهر في السجل.
- رفع صورة إنجاز تظهر بعد الحفظ.
- رفع صورة شخصية يظهر في الإعدادات والبطاقة.
- رابط استعادة كلمة المرور يرجع إلى صفحة تحديث كلمة المرور.
- تثبيت PWA يظهر على Chrome/Android عند توفر شروط التثبيت.

## ملاحظات إطلاق

- التطبيق static، لذلك لا يوجد build step حاليا.
- لا ترفع مفاتيح سرية داخل ملفات `js`. مفتاح Gemini يجب أن يبقى في Supabase Secrets فقط.
- مفتاح Supabase الموجود في `js/supabase.js` هو publishable key للواجهة، وليس service role.
- مجلد الصور اسمه الحالي `imges` ومستخدم بهذا الاسم في كل الروابط. لا تغير اسمه قبل الإطلاق إلا إذا حدثت كل المراجع.
