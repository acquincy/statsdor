import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nqqjwwyvulbefuxlxwob.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xcWp3d3l2dWxiZWZ1eGx4d29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTM5NDgsImV4cCI6MjEwOTEyOTk0OH0.LZb22vH4mRDTMnprl05shwyrbGz3CpTfxPjx0r4ekFU';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
