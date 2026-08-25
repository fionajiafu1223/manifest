import { supabase } from "../supabaseClient.js";

// 调用 world-pulse；返回 { success, data, error }，不抛异常
export async function triggerWorldPulse() {
  try {
    const { data, error } = await supabase.functions.invoke("world-pulse", {
      body: {}
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
