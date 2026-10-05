import { supabase } from "../supabaseClient.js";

// 角色语音消息：调用 character-voice 生成 mp3，存在手机本地 IndexedDB（不上云）。
// 以消息 id 为 key，生成一次后永久复用，不会重复扣 ElevenLabs 额度。

const DB_NAME = "voice-cache";
const STORE = "audio";
const inflight = {};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isVoiceMessage(m) {
  return !!(m && m.metadata && m.metadata.voice === true && m.direction !== "outgoing");
}

// 本地有就直接返回；没有就生成并存下。返回 audio/mpeg Blob，失败返回 null。
export async function getVoiceBlob(messageId) {
  if (!messageId) return null;
  try {
    const cached = await idbGet(messageId);
    if (cached) return cached;
  } catch (e) {
    console.warn("读取本地语音失败", e);
  }
  if (inflight[messageId]) return inflight[messageId];

  inflight[messageId] = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("character-voice", {
        body: { message_id: messageId },
      });
      if (error || !data) {
        console.warn("生成语音失败", error);
        return null;
      }
      const raw = data instanceof Blob ? data : new Blob([data]);
      const blob = new Blob([raw], { type: "audio/mpeg" });
      if (blob.size < 1000) return null; // 不是有效音频
      try { await idbPut(messageId, blob); } catch (e) { console.warn("保存本地语音失败", e); }
      return blob;
    } catch (e) {
      console.warn("生成语音异常", e);
      return null;
    } finally {
      delete inflight[messageId];
    }
  })();
  return inflight[messageId];
}

// world-pulse 返回后提前下载，消息到达时语音已经在本地了
export async function prefetchVoices(messages) {
  const list = (messages || []).filter(isVoiceMessage);
  for (const m of list) {
    await getVoiceBlob(m.id);
  }
}
