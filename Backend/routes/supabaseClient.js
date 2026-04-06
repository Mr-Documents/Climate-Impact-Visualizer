import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://adqruzwspkljwctjnits.supabase.co'; // Use env variable or default
const supabaseKey = process.env.SUPABASE_KEY; // This is now correct as per the .env file

export const supabase = createClient(supabaseUrl, supabaseKey);