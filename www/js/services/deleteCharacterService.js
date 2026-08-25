import { supabase } from "../supabaseClient.js";

// 软删除联系人；返回 { success, data, error }，不抛异常
export async function deleteCharacter(characterId) {
  try {
    const { data, error } = await supabase.functions.invoke("delete-character", {
      body: { character_id: characterId }
    });
    if (error) {
      let detail = null;
      try {
        if (error.context && typeof error.context.text === 'function') {
          const rawText = await error.context.text();
          try { detail = JSON.parse(rawText); } catch (_) { detail = rawText; }
        }
      } catch (_) {}
      return { success: false, error: { message: error.message, detail }, data: null };
    }
    return { success: true, error: null, data };
  } catch (err) {
    return { success: false, error: err, data: null };
  }
}
