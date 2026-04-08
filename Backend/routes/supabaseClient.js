import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://adqruzwspkljwctjnits.supabase.co'; // Use env variable or default
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service_role key to bypass RLS for server-side operations

export const supabase = createClient(supabaseUrl, supabaseKey);