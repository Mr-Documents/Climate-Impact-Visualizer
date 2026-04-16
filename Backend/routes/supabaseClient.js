import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service_role key to bypass RLS for server-side operations

// Validate that environment variables are loaded
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);