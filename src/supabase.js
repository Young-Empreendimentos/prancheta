import { createClient } from '@supabase/supabase-js'

// young-workspace — chave publicável (client-side, não é segredo). Login Google @young.
export const supabase = createClient(
  'https://vvtympzatclvjaqucebr.supabase.co',
  'sb_publishable_VRzI66cuw15hnqnoPKe27A_UmUbuhPC',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)
