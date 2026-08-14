import { supabase } from "../supabaseClient.js";

// 幂等键存在 sessionStorage 里：同一次"点击-可能超时-重试"过程复用同一个 key，
// 一旦明确成功或用户主动要求"重新生成"，才清掉换新的
const IDEMPOTENCY_KEY_STORAGE = "world_builder_idempotency_key";

function getOrCreateIdempotencyKey() {
  let key = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, key);
  }
  return key;
}

export function clearIdempotencyKey() {
  sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);
}

// 调用 world-builder；返回 { success, data, error }，不抛异常，方便调试页面直接展示原始结果
export async function buildWorld() {
  const idempotency_key = getOrCreateIdempotencyKey();
  try {
    const { data, error } = await supabase.functions.invoke("world-builder", {
      body: { idempotency_key }
    });
    if (error) {
      // FunctionsHttpError 的 error.context 是原始 Response 对象，
      // 默认打印/序列化看不到内容，这里手动把响应体读出来
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
    // 明确成功后，这个 idempotency key 的使命完成，清掉方便下次是全新一轮
    if (data && data.success) {
      clearIdempotencyKey();
    }
    return { success: true, error: null, data };
  } catch (err) {
    return { success: false, error: err, data: null };
  }
}
