import { supabase } from "../supabaseClient.js";

// 幂等键存在 sessionStorage 里，按场景类型分开存——同一次"选类型-点击-可能
// 超时-重试"过程复用同一个 key，一旦明确成功或用户主动换类型/重新生成，
// 才清掉换新的。和 worldService.js 的 getOrCreateIdempotencyKey 同思路。
function idempotencyStorageKey(template) {
  return `moment_generate_idempotency_key_${template}`;
}

function getOrCreateIdempotencyKey(template) {
  const storageKey = idempotencyStorageKey(template);
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

export function clearMomentIdempotencyKey(template) {
  sessionStorage.removeItem(idempotencyStorageKey(template));
}

// 调用 moment-generator；返回 { success, data, error }，不抛异常，
// 方便页面直接展示原始结果（和 buildWorld / triggerWorldPulse 保持一致）。
export async function generateMoment(template, description) {
  const idempotency_key = getOrCreateIdempotencyKey(template);
  try {
    const { data, error } = await supabase.functions.invoke(
      "moment-generator",
      {
        body: { idempotency_key, template, description },
      },
    );
    if (error) {
      let detail = null;
      let status = null;
      try {
        if (error.context && typeof error.context.text === "function") {
          status = error.context.status;
          const rawText = await error.context.text();
          try {
            detail = JSON.parse(rawText);
          } catch (_) {
            detail = rawText;
          }
        }
      } catch (readErr) {
        detail = "（读取响应体失败：" + (readErr.message || readErr) + "）";
      }
      return {
        success: false,
        error: { name: error.name, message: error.message, status, detail },
        data: null,
      };
    }
    // 明确成功后，这个 idempotency key 的使命完成，清掉方便下次是全新一轮
    if (data && data.success) {
      clearMomentIdempotencyKey(template);
    }
    return { success: true, error: null, data };
  } catch (err) {
    return { success: false, error: err, data: null };
  }
}
