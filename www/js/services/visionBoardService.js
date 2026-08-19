import { supabase } from "../supabaseClient.js";

// ============================================================
// 愿景板：vision_board_assets 的增删改查 + 图片上传
// 只暴露用户可编辑的字段：image_url / description / scene_id / intent_type
// meaning_type / status / interpretation / fulfillment_preferences / source_run_id
// 一律由后台流程写入，前端不读不传不改
// ============================================================

// 读取当前用户的所有愿景，按创建时间倒序
export async function getVisionAssets() {
  const { data, error } = await supabase
    .from("vision_board_assets")
    .select("id, image_url, description, scene_id, intent_type, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// 新建一条愿景记录（图片需已上传，传 uploadVisionImage() 返回的 url）
export async function createVisionAsset({ image_url, description, scene_id, intent_type }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");

  const { data, error } = await supabase
    .from("vision_board_assets")
    .insert({
      user_id: user.id,
      image_url,
      description: description || null,
      scene_id: scene_id || null,
      intent_type: intent_type === "script" ? "script" : "future"
      // status 不传，交给数据库默认值 'inspiration'
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 更新一条愿景（只允许改 description / scene_id / intent_type）
export async function updateVisionAsset(id, { description, scene_id, intent_type }) {
  const patch = {};
  if (description !== undefined) patch.description = description || null;
  if (scene_id !== undefined) patch.scene_id = scene_id || null;
  if (intent_type !== undefined) patch.intent_type = intent_type === "script" ? "script" : "future";

  const { data, error } = await supabase
    .from("vision_board_assets")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteVisionAsset(id) {
  const { error } = await supabase
    .from("vision_board_assets")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// 上传图片到 Storage，返回 public URL；上传失败会抛错，调用方不应再建数据库记录
export async function uploadVisionImage(file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");

  const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop() : "jpg";
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("vision-board")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("vision-board").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// 删除孤儿文件（图片传成功但数据库insert失败时的清理，失败也不抛错，静默忽略）
export async function deleteVisionImageQuiet(path) {
  try {
    await supabase.storage.from("vision-board").remove([path]);
  } catch (e) {
    // 忽略，留给后续清理任务
  }
}

// 供"关联到我的生活场景"选择器使用
export async function getScenesForPicker() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("scenes")
    .select("id, name")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}
