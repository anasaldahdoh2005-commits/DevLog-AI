import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supabaseUrl = 'https://hhjppsogkzxiobbbcxic.supabase.co';
const supabaseKey = 'sb_publishable__hFmFddkOpoDdviP2Lf_JQ_msqefiCU';

export const supabase = createClient(supabaseUrl, supabaseKey);
