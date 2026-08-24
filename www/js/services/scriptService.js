import { supabase } from "../supabaseClient.js";

// ============================================================
// 读取：把 main_characters + scenes + characters + scene_characters
// 拼回 life-script.html 用的 { hero, scenes } 结构
// ============================================================
export async function loadScript() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [mcRes, scenesRes] = await Promise.all([
    supabase.from("main_characters").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("scenes").select("*").eq("user_id", user.id).order("sort_order", { ascending: true })
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
    name: s.name,
    plot: s.description || "",
    highlight: s.focus || "",
    persons: scRows
      .filter(r => r.scene_id === s.id)
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
// 保存：把 scriptData 整个写进 Supabase
// main_characters：每个用户唯一一条，upsert
// scenes / characters(origin='user') / scene_characters：先清空旧的再重新写入
// ============================================================
export async function saveScript(scriptData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NOT_LOGGED_IN");
  const uid = user.id;

  const h = scriptData.hero || {};
  const mcRow = {
    user_id: uid,
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
  const { error: mcErr } = await supabase
    .from("main_characters")
    .upsert(mcRow, { onConflict: "user_id" });
  if (mcErr) throw mcErr;

  // 清空旧场景（级联清掉 scene_characters）和旧的用户自建人物
  const { error: delScenesErr } = await supabase.from("scenes").delete().eq("user_id", uid);
  if (delScenesErr) throw delScenesErr;
  const { error: delCharsErr } = await supabase
    .from("characters").delete().eq("user_id", uid).eq("origin", "user");
  if (delCharsErr) throw delCharsErr;

  const scenes = scriptData.scenes || [];
  const nameToCharacterId = new Map(); // 同名人物在多个场景里复用同一条 characters 记录

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const { data: sceneRow, error: sceneErr } = await supabase
      .from("scenes")
      .insert({
        user_id: uid,
        name: s.name || "未命名场景",
        description: s.plot || "",
        focus: s.highlight || null,
        sort_order: i
      })
      .select()
      .single();
    if (sceneErr) throw sceneErr;

    for (const p of (s.persons || [])) {
      const key = (p.name || "").trim().toLowerCase();
      let characterId = key ? nameToCharacterId.get(key) : null;

      if (!characterId) {
        const { data: charRow, error: charErr } = await supabase
          .from("characters")
          .insert({
            user_id: uid,
            name: p.name || "未命名人物",
            personality: p.character || null,
            background_story: p.background || null,
            avatar_url: p.avatar || null,
            initial_relationship: p.role || null,
            origin: "user",
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
          })
          .select()
          .single();
        if (charErr) throw charErr;
        characterId = charRow.id;
        if (key) nameToCharacterId.set(key, characterId);
      }

      const { error: scErr } = await supabase
        .from("scene_characters")
        .insert({
          user_id: uid,
          scene_id: sceneRow.id,
          character_id: characterId,
          role_in_scene: p.role || null,
          scene_context: p.attitude || null
        });
      if (scErr) throw scErr;
    }
  }
}
