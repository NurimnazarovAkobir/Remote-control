"use strict";

/**
 * Masofaviy Qurilma Lokatori — klient mantiqi.
 *
 * Ikki rol:
 *  - share : bu qurilmaning HAQIQIY joylashuvini (Geolocation API) rozilik bilan yuboradi.
 *  - watch : juftlashuv kodi orqali ulashilgan joylashuvni jonli ko'radi (Leaflet xarita).
 *
 * Aloqa: WebSocket orqali relay serverga. Joylashuv faqat "sharing" yoqilganda uzatiladi.
 */

(function () {
  // ---------- ko'rinishlarni boshqarish ----------
  var views = {
    home: document.getElementById("view-home"),
    share: document.getElementById("view-share"),
    watch: document.getElementById("view-watch"),
    invite: document.getElementById("view-invite"),
  };
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== name); });
  }
  document.getElementById("go-share").onclick = function () { show("share"); startShare(); };
  document.getElementById("go-watch").onclick = function () { show("watch"); };
  document.getElementById("go-invite").onclick = openInvite;
  Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
    b.onclick = function () { teardown(); show("home"); };
  });

  // ---------- WebSocket yordamchisi ----------
  function wsUrl() {
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host;
  }

  var sock = null;         // joriy WebSocket
  var role = null;         // "share" | "watch"
  var code = null;         // juftlashuv kodi
  var geoWatchId = null;   // navigator.geolocation.watchPosition id (brauzer)
  var nativeWatcherId = null; // BackgroundGeolocation watcher id (native APK)
  var reconnectTimer = null;
  var manuallyClosed = false;

  // Native (Capacitor APK) ichida ishlayapmizmi? Shunda orqa-fon plaginidan foydalanamiz.
  var CAP = window.Capacitor || null;
  var IS_NATIVE = !!(CAP && typeof CAP.isNativePlatform === "function" && CAP.isNativePlatform());
  // Native plaginlarni ishonchli olish: server.url orqali yuklangan sahifada
  // Capacitor.Plugins.X bo'sh bo'lishi mumkin, shuning uchun registerPlugin ishlatamiz.
  function getPlugin(name) {
    if (!IS_NATIVE || !CAP) return null;
    try {
      if (typeof CAP.registerPlugin === "function") return CAP.registerPlugin(name);
    } catch (e) { /* fall through */ }
    if (CAP.Plugins && CAP.Plugins[name]) return CAP.Plugins[name];
    return null;
  }
  var BGGeo = getPlugin("BackgroundGeolocation");
  var ScreenPlugin = getPlugin("ScreenShare");
  var screenOn = false;        // ekran ulashish yoqilganmi
  var frameListener = null;    // ScreenShare 'frame' listener handle

  function teardown() {
    manuallyClosed = true;
    if (screenOn) { stopScreen(); }
    stopGeo();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (sock) { try { sock.close(); } catch (_e) {} sock = null; }
    role = null; code = null;
    // share holatini reset
    document.getElementById("share-idle").hidden = false;
    document.getElementById("share-active").hidden = true;
    var sblock = document.getElementById("screen-block");
    if (sblock) sblock.hidden = true;
    // watch holatini reset
    document.getElementById("watch-connect").hidden = false;
    document.getElementById("watch-live").hidden = true;
    var swrap = document.getElementById("screen-wrap");
    if (swrap) { swrap.hidden = true; }
  }

  function connect(onOpen, onMessage) {
    manuallyClosed = false;
    function open() {
      sock = new WebSocket(wsUrl());
      sock.onopen = function () { onOpen && onOpen(); };
      sock.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (_e) { return; }
        onMessage && onMessage(m);
      };
      sock.onclose = function () {
        if (manuallyClosed) return;
        // avtomatik qayta ulanish
        reconnectTimer = setTimeout(open, 1500);
      };
      sock.onerror = function () { try { sock.close(); } catch (_e) {} };
    }
    open();
  }

  function sendSock(obj) {
    if (sock && sock.readyState === 1) sock.send(JSON.stringify(obj));
  }

  // ---------- umumiy formatlovchilar ----------
  function fmtCoords(lat, lng) { return lat.toFixed(5) + ", " + lng.toFixed(5); }
  function fmtAcc(a) { return (a == null) ? "—" : "±" + Math.round(a) + " m"; }
  function fmtBatt(b) { return (b == null) ? "qo‘llab-quvvatlanmaydi" : Math.round(b) + "%"; }
  function fmtAgo(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    if (s < 3) return "hozirgina";
    if (s < 60) return s + " soniya oldin";
    return Math.round(s / 60) + " daqiqa oldin";
  }

  // ======================================================
  //  INVITE — yuboriladigan havola yaratish
  // ======================================================
  function openInvite() {
    teardown();
    var inviteCode = genCode();
    var link = location.origin + location.pathname + "?role=share&code=" + inviteCode;
    document.getElementById("invite-code").textContent = inviteCode;
    document.getElementById("invite-link").value = link;
    show("invite");

    document.getElementById("copy-invite").onclick = function () { copyText(link, this); };
    document.getElementById("invite-start-watch").onclick = function () {
      document.getElementById("watch-code").value = inviteCode;
      show("watch");
      connectWatch();
    };
  }

  // ======================================================
  //  SHARE — kuzatiladigan qurilma
  // ======================================================
  function startShare(presetCode) {
    teardown();
    role = "share";
    code = (presetCode && /^\d{6}$/.test(presetCode)) ? presetCode : genCode();
    document.getElementById("share-code").textContent = code;
    document.getElementById("share-idle").hidden = false;
    document.getElementById("share-active").hidden = true;

    var hint = document.getElementById("share-geo-hint");
    if (!("geolocation" in navigator)) {
      hint.textContent = "Bu brauzer joylashuvni qo‘llab-quvvatlamaydi.";
    } else if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      hint.textContent = "Diqqat: joylashuv faqat HTTPS (yoki localhost) ustida ishlaydi. README dagi deploy bo‘limiga qarang.";
    } else {
      hint.textContent = "";
    }

    connect(
      function () { sendSock({ type: "hello", role: "share", code: code }); },
      function (m) { /* share uchun server xabarlari shart emas */ }
    );

    document.getElementById("copy-code").onclick = function () {
      copyText(code, this);
    };
    document.getElementById("start-share").onclick = beginSharing;
    document.getElementById("stop-share").onclick = stopSharing;

    // Ekran ulashish — faqat native APK'da (ScreenShare plagini mavjud bo'lsa).
    var sblock = document.getElementById("screen-block");
    sblock.hidden = !ScreenPlugin;
    if (ScreenPlugin) {
      var sbtn = document.getElementById("screen-btn");
      sbtn.textContent = "📺 Ekranni ham ulashish";
      sbtn.onclick = toggleScreen;
    }
  }

  // ---- ekran ulashish (native) ----
  function toggleScreen() {
    if (!ScreenPlugin) return;
    if (screenOn) { stopScreen(); } else { startScreen(); }
  }

  function startScreen() {
    ScreenPlugin.addListener("frame", function (e) {
      if (e && e.data) sendSock({ type: "frame", data: e.data });
    }).then(function (h) { frameListener = h; }).catch(function () { /* ignore */ });

    ScreenPlugin.start().then(function () {
      screenOn = true;
      sendSock({ type: "screen", on: true });
      var btn = document.getElementById("screen-btn");
      if (btn) btn.textContent = "⛔ Ekran ulashishni to'xtatish";
      var hint = document.getElementById("screen-hint");
      if (hint) hint.textContent = "Ekran ulashilmoqda — doimiy bildirishnoma turibdi.";
    }).catch(function (err) {
      cleanupScreenListener();
      var hint = document.getElementById("screen-hint");
      if (hint) hint.textContent = "Ekran ulashilmadi: " + (err && err.message ? err.message : err);
    });
  }

  function stopScreen() {
    if (ScreenPlugin) { try { ScreenPlugin.stop(); } catch (_e) { /* ignore */ } }
    cleanupScreenListener();
    screenOn = false;
    sendSock({ type: "screen", on: false });
    var btn = document.getElementById("screen-btn");
    if (btn) btn.textContent = "📺 Ekranni ham ulashish";
    var hint = document.getElementById("screen-hint");
    if (hint) hint.textContent = "To'xtatildi. Qayta ulashishingiz mumkin.";
  }

  function cleanupScreenListener() {
    if (frameListener && typeof frameListener.remove === "function") {
      try { frameListener.remove(); } catch (_e) { /* ignore */ }
    }
    frameListener = null;
  }

  var lastBattery = null;
  var consentSent = false;

  // Bitta joylashuv yangilanishini serverga va ekranga yetkazish (web va native uchun umumiy).
  function pushLocation(lat, lng, acc) {
    document.getElementById("share-idle").hidden = true;
    document.getElementById("share-active").hidden = false;
    if (!consentSent) { sendSock({ type: "consent", sharing: true }); consentSent = true; }
    sendSock({ type: "loc", lat: lat, lng: lng, acc: acc, battery: lastBattery });
    document.getElementById("s-coords").textContent = fmtCoords(lat, lng);
    document.getElementById("s-acc").textContent = fmtAcc(acc);
    document.getElementById("s-batt").textContent = fmtBatt(lastBattery);
    document.getElementById("s-updated").textContent = fmtAgo(Date.now());
  }

  function beginSharing() {
    consentSent = false;
    readBattery();
    // Native APK: orqa-fonda ham ishlaydigan plagin (doimiy bildirishnoma bilan).
    if (BGGeo) { beginSharingNative(); return; }
    // Brauzer: oddiy geolocation (faqat ilova ochiq turganda).
    if (!("geolocation" in navigator)) {
      document.getElementById("share-geo-hint").textContent = "Joylashuv mavjud emas.";
      return;
    }
    geoWatchId = navigator.geolocation.watchPosition(
      function (pos) {
        var c = pos.coords;
        pushLocation(c.latitude, c.longitude, c.accuracy);
      },
      function (err) {
        var hint = document.getElementById("share-geo-hint");
        document.getElementById("share-idle").hidden = false;
        document.getElementById("share-active").hidden = true;
        if (err.code === 1) hint.textContent = "Joylashuvga ruxsat berilmadi. Ulashish uchun ruxsat kerak.";
        else if (err.code === 2) hint.textContent = "Joylashuvni aniqlab bo‘lmadi.";
        else hint.textContent = "Joylashuvni olishda vaqt tugadi. Qayta urinib ko‘ring.";
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  // Batareya darajasini o'qish (ixtiyoriy — hamma brauzer/qurilmada yo'q).
  function readBattery() {
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        lastBattery = Math.round(b.level * 100);
        b.addEventListener("levelchange", function () { lastBattery = Math.round(b.level * 100); });
      }).catch(function () { lastBattery = null; });
    }
  }

  // Native APK: @capacitor-community/background-geolocation orqali orqa-fon kuzatuvi.
  // Doimiy bildirishnoma ko'rsatiladi (foydalanuvchi kuzatilayotganini doim biladi).
  function beginSharingNative() {
    BGGeo.addWatcher(
      {
        backgroundMessage: "Joylashuvingiz ulashilmoqda. To'xtatish uchun ilovани oching.",
        backgroundTitle: "Masofaviy Lokator — kuzatuv yoqilgan",
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      function (location, error) {
        if (error) {
          var hint = document.getElementById("share-geo-hint");
          document.getElementById("share-idle").hidden = false;
          document.getElementById("share-active").hidden = true;
          if (error.code === "NOT_AUTHORIZED") {
            hint.textContent = "Joylashuvga ruxsat berilmadi. Sozlamalardan ruxsat bering.";
          } else {
            hint.textContent = "Orqa-fon joylashuv xatosi: " + (error.message || error.code);
          }
          return;
        }
        if (location) {
          pushLocation(location.latitude, location.longitude, location.accuracy);
        }
      }
    ).then(function (id) {
      nativeWatcherId = id;
    }).catch(function (e) {
      document.getElementById("share-geo-hint").textContent = "Orqa-fon kuzatuvi ishga tushmadi: " + e;
    });
  }

  function stopGeo() {
    if (geoWatchId != null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    if (nativeWatcherId != null && BGGeo) {
      try { BGGeo.removeWatcher({ id: nativeWatcherId }); } catch (_e) { /* ignore */ }
      nativeWatcherId = null;
    }
  }
  function stopSharing() {
    stopGeo();
    sendSock({ type: "consent", sharing: false });
    document.getElementById("share-idle").hidden = false;
    document.getElementById("share-active").hidden = true;
    document.getElementById("share-geo-hint").textContent = "Ulashish to‘xtatildi. Qayta boshlashingiz mumkin.";
  }

  // ======================================================
  //  WATCH — nazoratchi qurilma
  // ======================================================
  var map = null, marker = null, accCircle = null, centeredOnce = false;

  document.getElementById("connect-watch").onclick = connectWatch;
  document.getElementById("watch-code").addEventListener("keydown", function (e) {
    if (e.key === "Enter") connectWatch();
  });
  document.getElementById("watch-disconnect").onclick = function () { teardown(); show("home"); };

  function connectWatch() {
    var input = document.getElementById("watch-code");
    var msg = document.getElementById("watch-msg");
    var val = (input.value || "").replace(/\D/g, "");
    if (val.length !== 6) { msg.textContent = "6 xonali kodni to‘liq kiriting."; msg.style.color = "var(--danger)"; return; }

    teardown();
    role = "watch";
    code = val;

    connect(
      function () { sendSock({ type: "hello", role: "watch", code: code }); },
      onWatchMessage
    );

    document.getElementById("watch-connect").hidden = true;
    document.getElementById("watch-live").hidden = false;
    setStatus("wait", "Ulanmoqda…");
    initMap();
  }

  function onWatchMessage(m) {
    if (m.type === "ready") {
      if (!m.sharerOnline) setStatus("off", "Qurilma oflayn");
      else if (!m.sharing) setStatus("wait", "Ruxsat kutilmoqda");
      else setStatus("on", "Jonli");
    } else if (m.type === "peer") {
      if (!m.sharerOnline) setStatus("off", "Qurilma oflayn");
      else if (!m.sharing) setStatus("wait", "Ruxsat kutilmoqda");
    } else if (m.type === "status") {
      if (m.sharerOnline === false) { setStatus("off", "Qurilma oflayn"); clearMarker(); }
      else if (m.sharing === false) { setStatus("off", "Ulashish to‘xtatildi"); clearMarker(); }
      else setStatus("on", "Jonli");
    } else if (m.type === "loc") {
      setStatus("on", "Jonli");
      updateLocation(m);
    } else if (m.type === "frame") {
      document.getElementById("screen-wrap").hidden = false;
      var note = document.getElementById("screen-note");
      if (note) note.hidden = true;
      var img = document.getElementById("screen-img");
      if (m.data) { img.hidden = false; img.src = m.data; }
    } else if (m.type === "screen") {
      var wrap2 = document.getElementById("screen-wrap");
      var note2 = document.getElementById("screen-note");
      var img2 = document.getElementById("screen-img");
      if (m.on) {
        wrap2.hidden = false;
        if (note2) { note2.hidden = false; note2.textContent = "Ekran kadrlari kutilmoqda…"; }
        if (img2) img2.hidden = true;
      } else {
        wrap2.hidden = true;
        if (img2) { img2.hidden = true; img2.removeAttribute("src"); }
      }
    } else if (m.type === "error") {
      setStatus("off", "Xatolik");
    }
  }

  function setStatus(kind, text) {
    var el = document.getElementById("w-status");
    el.className = "pill " + (kind === "on" ? "on" : kind === "wait" ? "wait" : "off");
    el.textContent = text;
  }

  function initMap() {
    if (map) return;
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([41.3111, 69.2797], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    }).addTo(map);
    centeredOnce = false;
    // konteyner endigina ko'rinadigan bo'lgani uchun o'lchamni yangilaymiz
    setTimeout(function () { if (map) map.invalidateSize(); }, 200);
  }

  function updateLocation(m) {
    if (!map) initMap();
    var ll = [m.lat, m.lng];
    if (!marker) {
      marker = L.marker(ll).addTo(map);
      accCircle = L.circle(ll, { radius: m.acc || 30, color: "#2563c7", weight: 1, fillOpacity: 0.12 }).addTo(map);
    } else {
      marker.setLatLng(ll);
      accCircle.setLatLng(ll).setRadius(m.acc || 30);
    }
    if (!centeredOnce) { map.setView(ll, 16); centeredOnce = true; }
    else map.panTo(ll);

    document.getElementById("w-coords").textContent = fmtCoords(m.lat, m.lng);
    document.getElementById("w-acc").textContent = fmtAcc(m.acc);
    document.getElementById("w-batt").textContent = fmtBatt(m.battery);
    document.getElementById("w-updated").textContent = fmtAgo(m.ts || Date.now());
  }

  function clearMarker() {
    if (marker && map) { map.removeLayer(marker); marker = null; }
    if (accCircle && map) { map.removeLayer(accCircle); accCircle = null; }
    document.getElementById("w-coords").textContent = "—";
    document.getElementById("w-acc").textContent = "—";
    document.getElementById("w-updated").textContent = "—";
  }

  // ---------- yordamchilar ----------
  function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

  function copyText(text, btn) {
    var old = btn.textContent;
    function done() { btn.textContent = "Nusxalandi ✓"; setTimeout(function () { btn.textContent = old; }, 1400); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else { fallback(); }
    function fallback() {
      try {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); document.body.removeChild(ta); done();
      } catch (_e) { /* nusxalab bo'lmadi */ }
    }
  }

  // ---------- deep-link: ?role=share&code=XXXXXX / ?role=watch&code=XXXXXX ----------
  (function handleDeepLink() {
    try {
      var p = new URLSearchParams(location.search);
      var r = p.get("role");
      var c = (p.get("code") || "").replace(/\D/g, "").slice(0, 6);
      if (c.length !== 6) return;
      if (r === "share") {
        show("share");
        startShare(c);
      } else if (r === "watch") {
        show("watch");
        document.getElementById("watch-code").value = c;
        connectWatch();
      }
    } catch (_e) { /* parametrlarsiz oddiy ochilish */ }
  })();
})();
