import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SupabaseConfig = { url: string; anonKey: string };

const getSupabaseConfig = (): SupabaseConfig | null => {
  const envUrl = 'https://vswjzfwicjfxlgdthczw.supabase.co'
  const envKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzd2p6ZndpY2pmeGxnZHRoY3p3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTE3NzksImV4cCI6MjA4MjE4Nzc3OX0.vv-UA0xMiAfo0yjFl-J9a_EMGX7BzNcafTIxX_aEjkk'
  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };

  return null;
};

let cachedClient: SupabaseClient | null = null;
let cachedSig: string | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  const sig = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedSig === sig) return cachedClient;

  cachedSig = sig;
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  return cachedClient;
};

export const isSupabaseConfigured = (): boolean => getSupabaseConfig() !== null;


