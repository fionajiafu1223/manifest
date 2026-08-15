import { supabase } from "../supabaseClient.js";

// 查询当前用户名下由AI生成的角色（origin='ai'），方便诊断页选一个来测试聊天
export async function listAiCharacters() {
  const { data, error } = await supabase
    .from("characters")
    .select("id, name, display_name")
    .eq("origin", "ai")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// 调用 chat-character；每次都用全新幂等键（诊断用途，不需要防重复）
export async function sendMessage(characterId, sceneId, content) {
  const idempotency_key = crypto.randomUUID();
  try {
    const { data, error } = await supabase.functions.invoke("chat-character", {
      body: {
        character_id: characterId,
        scene_id: sceneId,
        content,
        idempotency_key
      }
    });
    if (error) {
      let detail = null;
      let status = null;
      try {
        if (error.context && typeof error.context.text === 'function') {
          status = error.context.status;
          const rawText = await error.context.text();
          try { detail = JSON.parse(rawText); } catch (_) { detail = rawText; }
        }
      } catch (readErr) {
        detail = '（读取响应体失败：' + (readErr.message || readErr) + '）';
      }
      return {
        success: false,
        error: { name: error.name, message: error.message, status, detail },
        data: null
      };
    }
    return { success: true, error: null, data };
  } catch (err) {
    return { success: false, error: err, data: null };
  }
}
