import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nchcxhiwjcxhxmbcflsh.supabase.co';
const supabaseKey = 'sb_publishable_kK9Gdl0LeBg8h4aUPGkcwA_KW-dj-pd';

export const supabase = createClient(supabaseUrl, supabaseKey);
