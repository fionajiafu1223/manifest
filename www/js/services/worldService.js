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
      return { success: false, error, data: null };
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
