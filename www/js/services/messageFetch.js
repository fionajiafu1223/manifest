// 数据库一次查询最多返回 1000 条。消息多了以后，一次查不全会导致
// 列表/聊天里"看不到"新消息。这里统一分页把结果取全。
// buildQuery: () => supabase 查询（每页都需要新建一个查询对象）
export async function fetchAllRows(buildQuery, pageSize = 1000, maxPages = 20) {
  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) return { data: all.length ? all : null, error };
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return { data: all, error: null };
}
