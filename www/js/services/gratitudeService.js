// 感恩日记同步到 Supabase（gratitude_entries）。本地 localStorage 仍是主存储，
// 这里只做"写一份到云端"，供肯定语、角色回应等后端功能读取。失败静默，不影响写日记。
import { supabase } from "../supabaseClient.js";

function toRow(userId, y, m, d, entry) {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return {
    user_id: userId,
    client_id: `gj_${y}_${m}_${d}`,
    entry_date: `${y}-${mm}-${dd}`,
    content: entry.text,
    mood: typeof entry.mood === "number" ? entry.mood : null,
    updated_at: new Date().toISOString(),
  };
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function syncGratitudeEntry(y, m, d, entry) {
  try {
    const uid = await currentUserId();
    if (!uid || !entry?.text) return;
    await supabase.from("gratitude_entries")
      .upsert(toRow(uid, y, m, d, entry), { onConflict: "user_id,client_id" });
  } catch (e) { console.warn("gratitude sync failed", e); }
}

// 首次打开时把本地所有旧日记补传一次
export async function syncAllLocalGratitude() {
  try {
    const uid = await currentUserId();
    if (!uid) return;
    const flagKey = `gj_synced_${uid}`;
    if (localStorage.getItem(flagKey)) return;
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const mt = /^gj_(\d{4})_(\d{1,2})_(\d{1,2})$/.exec(k || "");
      if (!mt) continue;
      let entry = null;
      try { entry = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ }
      if (!entry?.text) continue;
      rows.push(toRow(uid, +mt[1], +mt[2], +mt[3], entry));
    }
    if (rows.length) {
      const { error } = await supabase.from("gratitude_entries")
        .upsert(rows, { onConflict: "user_id,client_id" });
      if (error) throw error;
    }
    localStorage.setItem(flagKey, "1");
  } catch (e) { console.warn("gratitude backfill failed", e); }
}
