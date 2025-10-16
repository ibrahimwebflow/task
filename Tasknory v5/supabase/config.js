// supabase/config.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://uxbhupgqhzrmljlamivi.supabase.co",   // replace with your project URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4Ymh1cGdxaHpybWxqbGFtaXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzOTkxNjMsImV4cCI6MjA3Mzk3NTE2M30.SQM_7YVmas-Ps0mduB0x0a3iAW9flQFiYVWihyhn438"                   // replace with anon key
);
