// Supabase 客户端 —— 全局唯一实例
// 注意：这里只能放 anon key，绝不能放 service_role key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://khvowwmtcvuixffgmpzg.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtodm93d210Y3Z1aXhmZmdtcHpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDM2MzksImV4cCI6MjEwMjI3OTYzOX0.ajOSh3Q1KS3lKyXgevYPgil2hsFpk8shzPjxoEQJ2LA";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
