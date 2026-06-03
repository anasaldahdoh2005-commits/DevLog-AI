const SUPABASE_URL = "https://wsrjtgatgymbvxeettkl.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indzcmp0Z2F0Z3ltYnZ4ZWV0dGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTIzNTEsImV4cCI6MjA5NTYyODM1MX0.-tGVJvyu68uoUEqfkqN3KxJLlQcpdnW-fjZW4WgjUL4";

export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);