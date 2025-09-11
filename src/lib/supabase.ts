import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const extra = (Constants.expoConfig?.extra || {}) as any;

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: { persistSession: false }, // dev mode: we aren’t using Supabase Auth yet
});
