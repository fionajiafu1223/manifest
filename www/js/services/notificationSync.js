// 本地推送统一排程：
// 每次打开 App 的任何页面都调用一次。直接从数据库读"还没到时间"的消息，
// 和手机上已排好的通知对比：新的补排、已撤掉的取消。
// 这样不依赖 world-pulse 返回结果，切走页面也不会漏排。
import { supabase } from "../supabaseClient.js";

const STORE_KEY = "scheduledNotificationIds";
const MAX_PENDING = 50; // iOS 单个 App 最多 64 条待发通知，留余量
const CHANNEL_LABEL = { wechat: "微信", email: "邮件", sms: "短信" };

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function notifId(key) {
  return (hashStr(String(key)) % 2000000000) + 1;
}
function pageFor(m) {
  if (m.channel === "email") return "email-list.html";
  if (m.channel === "sms") return "sms-list.html";
  return "wechat-sim.html?id=" + encodeURIComponent(m.character_id);
}
function getStored() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch (e) { return []; }
}
function setStored(ids) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(ids)); } catch (e) {}
}

let running = null;

export function syncNotifications(options = {}) {
  if (running) return running;
  running = doSync(options).finally(() => { running = null; });
  return running;
}

async function doSync({ requestPermission = false } = {}) {
  const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  if (!LN) return;
  try {
    const { requireUser } = await import("./authService.js");
    const user = await requireUser();
    if (!user) return;

    let perm = await LN.checkPermissions();
    if (perm.display !== "granted" && requestPermission) {
      perm = await LN.requestPermissions();
    }
    if (perm.display !== "granted") return;

    const nowIso = new Date().toISOString();
    const [{ data: msgs }, { data: events }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, character_id, channel, content, sent_at, metadata")
        .eq("user_id", user.id)
        .eq("direction", "incoming")
        .gt("sent_at", nowIso)
        .order("sent_at", { ascending: true })
        .limit(MAX_PENDING),
      supabase
        .from("world_events")
        .select("id, title, description, occurred_at")
        .eq("user_id", user.id)
        .eq("event_type", "windfall")
        .gt("occurred_at", nowIso)
        .limit(10),
    ]);

    const list = msgs || [];
    const charIds = [...new Set(list.map((m) => m.character_id).filter(Boolean))];
    const names = {};
    if (charIds.length) {
      const { data: chars } = await supabase
        .from("characters")
        .select("id, name, display_name")
        .in("id", charIds);
      (chars || []).forEach((c) => (names[c.id] = c.display_name || c.name || ""));
    }

    const desired = [];
    for (const m of list) {
      const at = new Date(m.sent_at);
      if (isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;
      const isVoice = m.metadata && m.metadata.voice === true;
      const prefix = names[m.character_id] ? names[m.character_id] + "：" : "";
      desired.push({
        id: notifId(m.id),
        title: CHANNEL_LABEL[m.channel] || "消息",
        body: prefix + (isVoice ? "[语音]" : (m.content || "")),
        schedule: { at, allowWhileIdle: true },
        extra: { page: pageFor(m) },
      });
    }
    for (const w of events || []) {
      const at = new Date(w.occurred_at);
      if (isNaN(at.getTime()) || at.getTime() <= Date.now()) continue;
      desired.push({
        id: notifId("windfall:" + w.id),
        title: w.title || "意外之喜",
        body: w.description || "",
        schedule: { at, allowWhileIdle: true },
        extra: { page: "desktop.html" },
      });
    }

    const desiredIds = new Set(desired.map((n) => n.id));
    let pendingIds = new Set();
    try {
      const pending = await LN.getPending();
      pendingIds = new Set((pending.notifications || []).map((n) => Number(n.id)));
    } catch (e) {}

    // 取消：之前由这里排的、现在已不需要的（消息被撤掉或已过时）
    const stale = getStored().filter((id) => !desiredIds.has(id) && pendingIds.has(id));
    if (stale.length) {
      await LN.cancel({ notifications: stale.map((id) => ({ id })) });
    }

    // 补排：还没排上的
    const toSchedule = desired.filter((n) => !pendingIds.has(n.id));
    if (toSchedule.length) {
      await LN.schedule({ notifications: toSchedule });
    }
    setStored([...desiredIds]);

    // 有语音消息就提前下载到本地
    if (list.some((m) => m.metadata && m.metadata.voice === true)) {
      import("./voiceService.js").then((v) => v.prefetchVoices(list)).catch(() => {});
    }
  } catch (e) {
    console.error("推送同步失败", e);
  }
}

// 点击通知后跳到对应页面（只注册一次）
try {
  const LN = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  if (LN && !window.__notifTapListener) {
    window.__notifTapListener = true;
    LN.addListener("localNotificationActionPerformed", (action) => {
      const page = action && action.notification && action.notification.extra && action.notification.extra.page;
      if (page) location.href = page;
    });
  }
} catch (e) {}
