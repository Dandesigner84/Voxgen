import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

export const getSupabase = () => {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = localStorage.getItem('supabase_url_override') || import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = localStorage.getItem('supabase_key_override') || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === 'your-project-url.supabase.co') {
    return null;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

export const signInWithGoogle = async () => {
  const client = getSupabase();
  if (!client) throw new Error('Supabase não configurado. Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações.');

  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
};
