# Silent Hill — Android APK

هذا المشروع يحول لعبة الويب إلى تطبيق Android باستخدام Capacitor.

## الطريقة الأسهل لإنتاج APK بدون تثبيت Android SDK على جهازك

1. ارفع هذا المشروع إلى مستودع GitHub.
2. افتح تبويب **Actions**.
3. اختر **Build Android APK**.
4. اضغط **Run workflow**.
5. بعد انتهاء البناء افتح نتيجة التشغيل وحمّل artifact باسم `silent-hill-apk`.
6. فك الضغط وستجد `app-debug.apk`، ثم انقله إلى هاتف Android وثبته.

## البناء محلياً

يتطلب Node.js وAndroid Studio/Android SDK.

```bash
npm ci
npm run android:add
npm run android:build
```

سيظهر APK في:

`android/app/build/outputs/apk/debug/app-debug.apk`

المشروع يستخدم Capacitor، وهو runtime لتغليف تطبيقات الويب كتطبيقات أصلية Android/iOS.
