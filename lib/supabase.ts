import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// ВСТАВЬ СВОИ ЗНАЧЕНИЯ ВМЕСТО ЭТИХ СТРОК
const supabaseUrl = 'https://qbbykfaeiddruoznweht.supabase.co'; 
const supabaseAnonKey = 'sb_publishable_YqRYQ4k-GTge9oapCoMgyw_O4NTys5C';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);