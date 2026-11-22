# Masofaviy Qurilma Lokatori (Remote Locator)

Rozilikka asoslangan **masofaviy qurilma kuzatuvi** — universitet loyihasi uchun.

Ikki qurilma internet orqali bog'lanadi:

- **Kuzatiladigan qurilma (share)** — o'z joriy joylashuvini brauzerning real Geolocation API'si orqali, **ochiq rozilik** bilan ulashadi. Ekranda doimiy ogohlantirish turadi va ulashishni istalgan vaqtda to'xtatadi.
- **Nazoratchi qurilma (watch)** — juftlashuv kodini kiritib, ulashilgan joylashuvni **jonli xaritada** masofadan ko'radi.

> **Muhim — bu stalkerware EMAS.** Kuzatiladigan qurilma egasi o'zi ruxsat beradi (ham ilova ichida, ham telefonning Geolocation ruxsati orqali), doimiy ogohlantirishni ko'radi va bir tugma bilan to'xtata oladi. Aynan shu narsa — ota-ona nazorati va "Qurilmamni top" tizimlari ishlaydigan qonuniy model.

---

## Texnologiyalar

| Qatlam | Tanlov | Sababi |
|---|---|---|
| Server | **Node.js + Express** | Statik fayllarni berish, sodda va keng tarqalgan |
| Realtime | **WebSocket (`ws`)** | Joylashuvni past kechikish bilan uzatish (relay) |
| Xarita | **Leaflet + OpenStreetMap** | Bepul, API kalitsiz, ochiq kodli |
| Joylashuv | **Geolocation API** | Qurilmaning haqiqiy GPS/tarmoq joylashuvi |
| Frontend | Vanilla JS | Build bosqichi yo'q — tushuntirish va taqdim qilish oson |

**Nega backend kerak?** Ikki telefon bir-birini to'g'ridan-to'g'ri topa olmaydi. Server xabarларни **uzatib beruvchi (relay)** vazifasini bajaradi. U joylashuvni **doimiy saqlamaydi** — faqat eslab turadi va sharing yoqilganda uzatadi (in-memory).

---

## O'rnatish va ishga tushirish (lokal)

Node.js 18+ kerak.

```bash
cd remote-locator
npm install
npm start
```

So'ng brauzerda oching: <http://localhost:3000>

Bitta kompyuterda sinash uchun: bitta oynada **"Bu qurilmani ulashish"**, ikkinchi oynada (yoki yangi tab'da) **"Boshqa qurilmani kuzatish"** — birinchisidagi kodni ikkinchisiga kiriting.

---

## Ikki haqiqiy telefonda sinash (masofaviy)

Geolocation API **xavfsiz kontekst** talab qiladi: ya'ni `https://` yoki `localhost`. Oddiy LAN IP (`http://192.168.x.x`) ustida brauzer joylashuvni **bloklaydi**. Shuning uchun ikki telefon bilan sinash uchun ilovani HTTPS bilan joylashtirish kerak. Ikki variant:

### Variant A — Render.com ga deploy (tavsiya etiladi, bepul, HTTPS bilan)

1. Loyihani GitHub'ga yuklang (`git init`, commit, push).
2. [render.com](https://render.com) → **New → Web Service** → GitHub repo'ni ulang.
3. Sozlamalar:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Render `PORT` ni avtomatik beradi (kod uni o'qiydi).
4. Deploy tugagach, Render bergan `https://...onrender.com` manzilini **ikkala telefonda** oching.

### Variant B — vaqtinchalik tunnel (tez sinash uchun)

Lokal serverni ishga tushiring, so'ng boshqa terminalda:

```bash
npx localtunnel --port 3000
```

Berilgan `https://...loca.lt` manzilini ikkala telefonda oching. (Alternativa: `ngrok http 3000`.)

---

## Android APK (Capacitor)

Web-ilova **Capacitor** bilan haqiqiy Android ilovasiga o'raladi. APK telefonga o'rnatiladi (foydalanuvchi o'zi "O'rnatish"ni bosadi — avtomatik/yashirin o'rnatish yo'q) va joylashuvni tizim ruxsati bilan ulashadi.

> **Eslatma:** APK fayli bu loyihada **oldindan yig'ilmagan** — ishlab chiqish muhitida Android SDK yo'q edi. Loyiha to'liq sozlangan; `.apk` ni quyidagi qadamlar bilan **Android Studio orqali o'zingiz yig'asiz**.

### Talablar
- [Android Studio](https://developer.android.com/studio) (JDK 17 bilan birga keladi) va Android SDK.
- Deploy qilingan **HTTPS** server manzili (yuqoridagi "Render" bo'limiga qarang). Joylashuv faqat HTTPS ustida ishlaydi, shuning uchun bu shart.

### Qadamlar
1. Serverni Render'ga deploy qiling va manzilni oling (masalan `https://remote-locator.onrender.com`).
2. `capacitor.config.json` dagi `server.url` ni o'sha manzilga almashtiring:
   ```json
   "url": "https://remote-locator.onrender.com"
   ```
3. Sinxronlang va Android Studio'da oching:
   ```bash
   npx cap sync android
   npx cap open android
   ```
4. APK yig'ing (ikki usuldan biri):
   - **Android Studio:** `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
   - **Terminal:**
     ```bash
     cd android
     ./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
     ```
   Tayyor fayl: `android/app/build/outputs/apk/debug/app-debug.apk`.
5. `app-debug.apk` ni telefonga ko'chiring va oching → "Noma'lum manbalardan o'rnatish"ga ruxsat bering → **O'rnatish**. Ilova birinchi ochilganda **joylashuv ruxsatini** so'raydi.

### Nega `server.url`?
Ilova WebView ichida deploy qilingan web-ilovani ochadi — shunda WebSocket va joriy (nisbiy) manzillar to'g'ri ishlaydi. Joylashuv uchun `AndroidManifest.xml` da `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` ruxsatlari yoqilgan; Capacitor WebView tizim ruxsati oynasini ko'rsatadi. Agar joylashuv oynasi chiqmasa, `npm i @capacitor/geolocation` qo'shing (Capacitor WebView'ga ruxsatni to'g'ri ulaydi).

### Orqa fonda kuzatuv (ixtiyoriy — ilova yopiq bo'lsa ham)
Oddiy WebView joylashuvni faqat ilova ochiq turganda yuboradi. Ilova yopiq bo'lsa ham kuzatish uchun:
1. `AndroidManifest.xml` dagi izohga olingan `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` qatorlarini yoqing.
2. `@capacitor-community/background-geolocation` plaginini o'rnating va uning yo'riqnomasiga amal qiling.
3. Android qoidasiga ko'ra orqa-fon joylashuvida **doimiy bildirishnoma** majburiy — bu rozilik/ko'rinish modeliga mos keladi (foydalanuvchi kuzatilayotganini doim biladi).

Bu qism men tomonidan sinovdan o'tkazilmagan (native kompilyatsiya shart) — konfiguratsiya tayyor, yig'ish va test siz tomoningizda.

---

## Qanday ishlaydi (oqim)

```
Kuzatiladigan telefon (share)          Server (relay)          Nazoratchi telefon (watch)
  │ 1. kod yaratadi: 483921                 │                         │
  │ 2. "ruxsat beraman" → GPS ruxsati       │                         │
  │ 3. loc {lat,lng,acc,batt} ──────────────►  kod bo'yicha saqlaydi  │
  │                                          │ ◄──── 4. kod: 483921 ───│  "ulanish"
  │                                          │ ──── jonli loc ────────►│  xaritada ko'rsatadi
  │ 5. "to'xtatish" → sharing=false ─────────► loc'ni uzatishni to'xtatadi
  │                                          │ ──── "status: off" ────►│  joylashuv yo'qoladi
```

Server qoidasi: `sharing=false` bo'lsa, hech qanday joylashuv watcher'ga uzatilmaydi.

---

## Loyiha tuzilishi

```
remote-locator/
├── server.js             # Express + WebSocket relay
├── package.json
├── .env.example          # PORT namunasi
├── capacitor.config.json # Android (APK) sozlamalari — server.url shu yerda
├── public/
│   ├── index.html        # UI (home / share / watch / invite ko'rinishlari)
│   ├── style.css         # uslublar (och/to'q tema)
│   └── app.js            # klient mantiqi (geolocation, websocket, xarita, deep-link)
├── android/              # Capacitor Android loyihasi (APK shu yerdan yig'iladi)
└── README.md
```

---

## Axloqiy va qonuniy dizayn (loyihaning kuchli tomoni)

Topshiriqni himoya qilishda shu uch tamoyilni ko'rsating:

1. **Ochiq rozilik (opt-in).** Hech narsa avtomatik yoki yashirin o'rnatilmaydi. Kuzatiladigan qurilma egasi o'zi "Ruxsat beraman" tugmasini bosadi va brauzer/telefon ham Geolocation ruxsatini so'raydi.
2. **Doimiy ko'rinish.** Ulashish davomida ekranda ogohlantiruvchi banner turadi va qaysi ma'lumot uzatilayotgani ko'rsatiladi.
3. **To'liq nazorat.** Ulashishni istalgan vaqtda bir tugma bilan to'xtatish mumkin; o'shanda nazoratchi darhol joylashuvni yo'qotadi. Server joylashuvni doimiy saqlamaydi.

---

## Ma'lum cheklovlar

- **Xavfsiz kontekst shart.** Ikki telefon uchun HTTPS (deploy yoki tunnel) kerak — yuqoriga qarang.
- **Batareya darajasi** faqat `getBattery()` ni qo'llab-quvvatlaydigan brauzerlarda ko'rinadi (masalan Chrome/Android). iOS Safari'da "qo'llab-quvvatlanmaydi" deb chiqadi.
- **Saqlash yo'q.** Sessiya ma'lumotlari xotirada (in-memory); server qayta ishga tushsa yo'qoladi. Ishlab chiqarish uchun ma'lumotlar bazasi va autentifikatsiya qo'shilishi kerak.
- **Autentifikatsiya yo'q.** Demo uchun kod yetarli; real tizimda foydalanuvchi hisoblari va kuchliroq juftlashuv kerak.

---

## Keyingi qadamlar (ixtiyoriy yaxshilash)

- Foydalanuvchi hisoblari + har bir juftlashuvni saqlash (PostgreSQL).
- Nazoratchi so'rovini kuzatiladigan qurilma **tasdiqlashi** (ikki tomonlama juftlashuv).
- Joylashuv tarixi va "geofence" ogohlantirishlari.
- PWA sifatida "o'rnatiladigan" qilish (orqa fonda ishlash cheklovlari bilan).
