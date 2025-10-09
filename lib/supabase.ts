import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types based on the PRD schema
export interface Project {
  id: string;
  name: string;
  created_at: string;
}

export interface ProjectLanguage {
  id: string;
  project_id: string;
  language_code: string;
  language_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TranslationKey {
  id: string;
  project_id: string;
  key: string;
  created_at: string;
}

export interface Translation {
  id: string;
  key_id: string;
  project_language_id: string;
  value: string | null;
  updated_at: string;
}

// Combined type for the grid view
export interface TranslationRow {
  key: string;
  key_id: string;
  translations: Record<string, { value: string | null; translation_id: string; language_id: string }>;
}
