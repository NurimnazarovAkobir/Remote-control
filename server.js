"use strict";

/**
 * Rozilikka asoslangan masofaviy qurilma kuzatuvi — relay server.
 *
 * Vazifasi: bitta qurilma (sharer / "kuzatiladigan") o'z joylashuvini
 * OCHIQ ROZILIK bilan yuboradi; boshqa qurilma(lar) (watcher / "nazoratchi")
 * juftlashuv kodi orqali uni jonli ko'radi. Server faqat xabarlarni uzatadi
 * (relay) — joylashuv doimiy saqlanmaydi (in-memory, sessiya tugasa yo'qoladi).
 *
 * Muhim: sharer "sharing=false" bo'lsa, server hech qanday joylashuvni
 * watcherlarga uzatmaydi. Rozilik — tizimning markazida.
 */

const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public")));

// Sodda sog'liq tekshiruvi (deploy platformalari uchun)
app.get("/healthz", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

/**
 * sessions: code -> {
 *   sharer: WebSocket|null,
 *   watchers: Set<WebSocket>,
 *   sharing: boolean,          // sharer rozilik berganmi
 *   last: {lat,lng,acc,battery,ts}|null
 * }
 */
const sessions = new Map();

function getSession(code) {
  let s = sessions.get(code);
  if (!s) {
    s = {
      sharer: null, watchers: new Set(), sharing: false, last: null,
      screenOn: false, frames: 0, lastFrameAt: 0,
    };
    sessions.set(code, s);
  }
  return s;
}

// Diagnostika: faqat sanoqlar — juftlashuv kodlari NIQOBLANADI (maxfiylik uchun).
app.get("/debug", (_req, res) => {
  const now = Date.now();
  const out = [];
  for (const [code, s] of sessions) {
    out.push({
      codeMasked: "**" + String(code).slice(-2), // faqat oxirgi 2 raqam
      sharerOnline: !!s.sharer,
      watchers: s.watchers.size,
      locationSharing: s.sharing,
      screenOn: s.screenOn,
      framesRelayed: s.frames,
      lastFrameAgoMs: s.lastFrameAt ? now - s.lastFrameAt : null,
      lastLocAgoMs: s.last ? now - s.last.ts : null,
    });
  }
  res.json({ now, sessionCount: sessions.size, sessions: out });
});

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_e) { /* socket yopilgan */ }
  }
}

function broadcastWatchers(s, obj) {
  for (const w of s.watchers) send(w, obj);
}

function cleanup(code) {
  const s = sessions.get(code);
  if (s && !s.sharer && s.watchers.size === 0) sessions.delete(code);
}

wss.on("connection", (ws) => {
  ws.meta = { role: null, code: null };
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_e) { return; }
    if (!m || typeof m !== "object") return;

    if (m.type === "hello") {
      const code = String(m.code || "").replace(/\D/g, "").slice(0, 6);
      const role = m.role === "share" ? "share" : m.role === "watch" ? "watch" : null;
      if (code.length !== 6 || !role) { send(ws, { type: "error", error: "bad_request" }); return; }

      ws.meta.role = role;
      ws.meta.code = code;
      const s = getSession(code);

      if (role === "share") {
        // Bitta kod uchun bitta sharer. Eskisi bo'lsa, almashtiramiz.
        s.sharer = ws;
        send(ws, { type: "ready", code });
        broadcastWatchers(s, { type: "peer", sharerOnline: true, sharing: s.sharing, screenOn: s.screenOn });
      } else {
        s.watchers.add(ws);
        send(ws, {
          type: "ready",
          code,
          sharerOnline: !!s.sharer,
          sharing: s.sharing,
          screenOn: s.screenOn,
        });
        if (s.sharing && s.last) send(ws, Object.assign({ type: "loc" }, s.last));
      }
      return;
    }

    // Quyidagilar faqat tanishtiruvdan keyin
    if (!ws.meta.code) return;
    const s = getSession(ws.meta.code);

    if (m.type === "consent" && ws.meta.role === "share") {
      s.sharing = !!m.sharing;
      if (!s.sharing) s.last = null;
      broadcastWatchers(s, { type: "status", sharing: s.sharing, sharerOnline: true, screenOn: s.screenOn });
      return;
    }

    if (m.type === "loc" && ws.meta.role === "share") {
      if (!s.sharing) return; // rozilik yo'q — uzatmaymiz
      const lat = Number(m.lat), lng = Number(m.lng);
      if (!isFinite(lat) || !isFinite(lng)) return;
      s.last = {
        lat, lng,
        acc: isFinite(Number(m.acc)) ? Number(m.acc) : null,
        battery: (m.battery === null || m.battery === undefined) ? null : Number(m.battery),
        ts: Date.now(),
      };
      broadcastWatchers(s, Object.assign({ type: "loc" }, s.last));
      return;
    }

    // Ekran kadri (base64 JPEG) — sharer yuboradi, watcherlarga uzatiladi.
    // Katta string, shuning uchun hajm chegarasi qo'yilgan.
    if (m.type === "frame" && ws.meta.role === "share") {
      if (typeof m.data === "string" && m.data.length > 0 && m.data.length < 3000000) {
        s.frames++;
        s.lastFrameAt = Date.now();
        broadcastWatchers(s, { type: "frame", data: m.data, ts: Date.now() });
      }
      return;
    }

    if (m.type === "ping") {
      send(ws, { type: "pong" });
      return;
    }

    if (m.type === "screen" && ws.meta.role === "share") {
      s.screenOn = !!m.on;
      broadcastWatchers(s, { type: "screen", on: !!m.on });
      return;
    }
  });

  ws.on("close", () => {
    const { role, code } = ws.meta;
    if (!code) return;
    const s = sessions.get(code);
    if (!s) return;
    if (role === "share") {
      s.sharer = null;
      broadcastWatchers(s, { type: "peer", sharerOnline: false, sharing: s.sharing });
    } else {
      s.watchers.delete(ws);
    }
    cleanup(code);
  });
});

// O'lik ulanishlarni tozalash (har 30s)
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_e) { /* ignore */ }
  });
}, 30000);
wss.on("close", () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Remote locator ishga tushdi: http://localhost:${PORT}`);
});
