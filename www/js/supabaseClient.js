// Supabase 客户端 —— 全局唯一实例
// 注意：这里只能放 anon key，绝不能放 service_role key
//
// SDK改为从本地打包文件加载（www/js/vendor/supabase-js.esm.js），
// 不再从 esm.sh 远程CDN实时拉取。
// 原因：esm.sh 的 import 会在每次页面加载时发起多个网络子请求去拉依赖，
// 手机网络稍有波动（切换WiFi/蜂窝、信号弱）就会导致这个 import 失败，
// 进而让 index.html 的登录检查 checkLogin() 把"网络错误"误判成"未登录"，
// 弹回登录页——即使用户刚刚登录成功。改成本地文件后，加载SDK不再需要联网。
import { createClient } from "./vendor/supabase-js.esm.js";

const SUPABASE_URL = "https://khvowwmtcvuixffgmpzg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtodm93d210Y3Z1aXhmZmdtcHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDM2MzksImV4cCI6MjEwMjI3OTYzOX0.ajOSh3Q1KS3lKyXgevYPgil2hsFpk8shzPjxoEQJ2LA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
