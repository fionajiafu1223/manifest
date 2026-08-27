import { supabase } from "../supabaseClient.js";

// ============================================================
// 读取：把 main_characters + scenes + characters + scene_characters
// 拼回 life-script.html 用的 { hero, scenes } 结构
//
// v3 变化：每个场景、每个人物都带上自己的数据库 id（以及场景/人物
// 各自的 world_built_at）。前端靠这些 id 才能做到"只更新被编辑的
// 这一条，不碰其他场景/角色"——不再需要靠场景名/人物名去猜哪条是
// 哪条。
// ============================================================
export async function loadScript() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [mcRes, scenesRes] = await Promise.all([
    supabase.from("main_characters").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("scenes").select("*").eq("user_id", user.id).eq("is_active", true).order("sort_order", { ascending: true })
  ]);
  if (mcRes.error) throw mcRes.error;
  if (scenesRes.error) throw scenesRes.error;

  const mc = mcRes.data;
  const scenes = scenesRes.data || [];
  if (!mc && scenes.length === 0) return null;

  const hero = mc ? mainCharacterToHero(mc) : {};

  const sceneIds = scenes.map(s => s.id);
  let scRows = [];
  if (sceneIds.length > 0) {
    const { data, error } = await supabase
      .from("scene_characters")
      .select("scene_id, role_in_scene, scene_context, characters(*)")
      .in("scene_id", sceneIds);
    if (error) throw error;
    scRows = data || [];
  }

  const scenesOut = scenes.map(s => ({
    id: s.id,
    world_built_at: s.world_built_at,
    name: s.name,
    plot: s.description || "",
    highlight: s.focus || "",
    persons: scRows
      .filter(r => r.scene_id === s.id && r.characters && r.characters.is_active !== false)
      .map(r => characterToPerson(r.characters, r.role_in_scene, r.scene_context))
  }));

  return { hero, scenes: scenesOut };
}

function mainCharacterToHero(mc) {
  const c = mc.canon || {};
  return {
    name: mc.name || "",
    gender: c.gender || null,
    avatar: c.avatar || null,
    age: c.age || "",
    zodiac: c.zodiac || "",
    look: mc.appearance || "",
    body: c.body || "",
    style: c.style || "",
    character: mc.personality || "",
    values: c.values || "",
    lifeView: c.lifeView || "",
    worldView: c.worldView || "",
    hobby: c.hobby || "",
    gift: c.gift || "",
    job: mc.career || "",
    home: mc.residence || "",
    background: c.background || "",
    experience: c.experience || "",
    desire: c.desire || "",
    become: c.become || ""
  };
}

function characterToPerson(ch, roleInScene, sceneContext) {
  const c = (ch && ch.canon) || {};
  const handles = (ch && ch.contact_handles) || {};
  return {
    id: ch ? ch.id : null,
    world_built_at: ch ? ch.world_built_at : null,
    name: ch ? (ch.name || "") : "",
    role: roleInScene || "",
    age: c.age || "",
    gender: c.gender || "",
    look: c.look || "",
    character: ch ? (ch.personality || "") : "",
    values: c.values || "",
    background: ch ? (ch.background_story || "") : "",
    attitude: sceneContext || "",
    avatar: ch ? (ch.avatar_url || null) : null,
    wechat: handles.wechat || "",
    phone: handles.phone || "",
    email: handles.email || ""
  };
}

// ============================================================
// 保存主角设定——每个用户唯一一条，直接 upsert。这是纯粹的数据保存，
// 不触发任何 AI 调用。
// ============================================================
export async function saveHero(heroData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");
  const h = heroData || {};
  const mcRow = {
    user_id: user.id,
    name: h.name || null,
    personality: h.character || null,
    appearance: h.look || null,
    career: h.job || null,
    residence: h.home || null,
    canon: {
      gender: h.gender || null,
      avatar: h.avatar || null,
      age: h.age || null,
      zodiac: h.zodiac || null,
      body: h.body || null,
      style: h.style || null,
      values: h.values || null,
      lifeView: h.lifeView || null,
      worldView: h.worldView || null,
      hobby: h.hobby || null,
      gift: h.gift || null,
      background: h.background || null,
      experience: h.experience || null,
      desire: h.desire || null,
      become: h.become || null
    }
  };
  const { error } = await supabase
    .from("main_characters")
    .upsert(mcRow, { onConflict: "user_id" });
  if (error) throw error;
}

// ============================================================
// 保存单个场景——v3 的核心变化。
//
// 只更新/插入这一个场景本身、这一个场景挂的人物，绝不touch其他任何
// 场景或角色的数据库记录。已有 id 的场景/人物走 UPDATE（保留原有
// id 和 world_built_at，也就保留了它们"是否已经开演过"的状态）；
// 没有 id 的（新建的场景、新加的人物）走 INSERT。
//
// 这是跟旧版 saveScript() 最根本的区别：旧版每次保存都会把账户里
// 所有场景/角色整个删除重建，导致所有场景的 world_built_at 全部
// 归零——这正是之前"改一次剧本、17个人一起冒出来"那次事故的根源。
// ============================================================
export async function persistScene(sceneData, sortOrderHint) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");
  const uid = user.id;

  let sceneId = sceneData.id || null;

  if (sceneId) {
    const { error } = await supabase
      .from("scenes")
      .update({
        name: sceneData.name || "未命名场景",
        description: sceneData.plot || "",
        focus: sceneData.highlight || null
      })
      .eq("id", sceneId)
      .eq("user_id", uid);
    if (error) throw error;
  } else {
    const { data: sceneRow, error } = await supabase
      .from("scenes")
      .insert({
        user_id: uid,
        name: sceneData.name || "未命名场景",
        description: sceneData.plot || "",
        focus: sceneData.highlight || null,
        sort_order: sortOrderHint ?? 0
      })
      .select()
      .single();
    if (error) throw error;
    sceneId = sceneRow.id;
  }

  // 这个场景目前在数据库里挂着哪些人物——用来判断这次编辑里
  // 谁被移出了这个场景（角色本身不删，只是解除跟这个场景的关联）。
  const { data: existingLinks, error: linksErr } = await supabase
    .from("scene_characters")
    .select("character_id")
    .eq("scene_id", sceneId)
    .eq("user_id", uid);
  if (linksErr) throw linksErr;
  const existingCharacterIds = new Set((existingLinks || []).map(l => l.character_id));

  const persistedPersons = [];
  const keptCharacterIds = new Set();

  for (const p of (sceneData.persons || [])) {
    let characterId = p.id || null;
    const charRow = {
      name: p.name || "未命名人物",
      personality: p.character || null,
      background_story: p.background || null,
      avatar_url: p.avatar || null,
      initial_relationship: p.role || null,
      contact_handles: {
        wechat: p.wechat || null,
        phone: p.phone || null,
        email: p.email || null
      },
      canon: {
        age: p.age || null,
        gender: p.gender || null,
        look: p.look || null,
        values: p.values || null
      }
    };

    if (characterId) {
      const { error } = await supabase
        .from("characters")
        .update(charRow)
        .eq("id", characterId)
        .eq("user_id", uid);
      if (error) throw error;
    } else {
      const { data: newChar, error } = await supabase
        .from("characters")
        .insert({ ...charRow, user_id: uid, origin: "user" })
        .select()
        .single();
      if (error) throw error;
      characterId = newChar.id;
    }

    keptCharacterIds.add(characterId);

    if (existingCharacterIds.has(characterId)) {
      const { error } = await supabase
        .from("scene_characters")
        .update({
          role_in_scene: p.role || null,
          scene_context: p.attitude || null
        })
        .eq("scene_id", sceneId)
        .eq("character_id", characterId)
        .eq("user_id", uid);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("scene_characters")
        .insert({
          user_id: uid,
          scene_id: sceneId,
          character_id: characterId,
          role_in_scene: p.role || null,
          scene_context: p.attitude || null
        });
      if (error) throw error;
    }

    // world_built_at 只从数据库读回，前端本地拼的 person 对象里
    // 不该猜这个值——保存动作本身不改变它。
    persistedPersons.push({ ...p, id: characterId });
  }

  // 这次编辑里被从场景里删掉的人物：解除跟场景的关联，角色本身留着
  // （不在这里删除角色数据，只是这个场景不再引用它）。
  const removedCharacterIds = [...existingCharacterIds].filter(
    id => !keptCharacterIds.has(id)
  );
  if (removedCharacterIds.length > 0) {
    const { error } = await supabase
      .from("scene_characters")
      .delete()
      .eq("scene_id", sceneId)
      .eq("user_id", uid)
      .in("character_id", removedCharacterIds);
    if (error) throw error;
  }

  return {
    id: sceneId,
    name: sceneData.name,
    plot: sceneData.plot,
    highlight: sceneData.highlight,
    persons: persistedPersons
  };
}

// ============================================================
// 软删除一个场景——is_active=false，数据保留，之后 loadScript()/
// world-builder 都不会再看到它。
// ============================================================
export async function deleteScene(sceneId) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");
  const { error } = await supabase
    .from("scenes")
    .update({ is_active: false })
    .eq("id", sceneId)
    .eq("user_id", user.id);
  if (error) throw error;
}
