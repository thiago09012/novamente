import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabase.types';

let client: ReturnType<typeof createClient<Database>> | null | undefined;

export function getSupabaseClient(): ReturnType<typeof createClient<Database>> | null {
  if (client !== undefined) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  client = url && key ? createClient<Database>(url, key) : null;
  return client;
}
