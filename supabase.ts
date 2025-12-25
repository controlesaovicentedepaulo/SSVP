import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSettings } from './settings';

type SupabaseConfig = { url: string; anonKey: string };

const getSupabaseConfig = (): SupabaseConfig | null => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (envUrl && envKey) return { url: envUrl, anonKey: envKey };

  const { supabaseUrl, supabaseKey } = getSettings();
  if (supabaseUrl && supabaseKey) return { url: supabaseUrl, anonKey: supabaseKey };

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


