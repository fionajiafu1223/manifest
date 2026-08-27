import { supabase } from "../supabaseClient.js";

// 幂等键按场景分开存：同一个场景的"点击-可能超时-重试"过程复用同一个
// key，一旦这个场景明确开演成功，才清掉换新的。不同场景各用各的 key，
// 互不干扰。
function idempotencyStorageKey(sceneId) {
  return `world_builder_idempotency_key_${sceneId}`;
}

function getOrCreateIdempotencyKey(sceneId) {
  const storageKey = idempotencyStorageKey(sceneId);
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

export function clearIdempotencyKey(sceneId) {
  sessionStorage.removeItem(idempotencyStorageKey(sceneId));
}

// 调用 world-builder，只处理 sceneId 指定的这一个场景；
// 返回 { success, data, error }，不抛异常，方便页面直接展示原始结果
export async function buildWorld(sceneId) {
  const idempotency_key = getOrCreateIdempotencyKey(sceneId);
  try {
    const { data, error } = await supabase.functions.invoke("world-builder", {
      body: { idempotency_key, scene_id: sceneId }
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
    // 明确成功后，这个场景的 idempotency key 使命完成，清掉方便下次是全新一轮
    if (data && data.success) {
      clearIdempotencyKey(sceneId);
    }
    return { success: true, error: null, data };
  } catch (err) {
    return { success: false, error: err, data: null };
  }
}
