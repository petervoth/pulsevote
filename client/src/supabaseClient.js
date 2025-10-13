import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tzxajgcdqxeflpmmkxys.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6eGFqZ2NkcXhlZmxwbW1reHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MjczMjYsImV4cCI6MjA3NDAwMzMyNn0.Kzh-Fznx_9vd2Z0r-hPmwHCWagxlGsOR5ELRlJ68DJ0";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
