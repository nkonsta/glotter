export interface AiTranslateEntry {
  key: string;
  text: string; // source text
}

export interface AiGlossaryTerm {
  source: string;
  target: string;
}

export interface AiTranslateOptions {
  style?: 'default' | 'formal' | 'informal' | 'marketing' | 'technical';
  formality?: 'default' | 'more' | 'less';
  glossary?: AiGlossaryTerm[];
  preservePlaceholders?: boolean;
  dryRun?: boolean;
}

export interface AiTranslateRequestBody {
  projectId: string;
  sourceLanguage: string; // BCP-47 like 'en'
  targetLanguages: string[]; // e.g., ['fr','de']
  entries: AiTranslateEntry[];
  options?: AiTranslateOptions;
}

export interface AiSuggestedTranslation {
  key: string;
  text: string; // original source text
  aiText: string; // AI suggestion
  changed: boolean; // whether suggestion differs from existing value (always true for missing)
  confidence?: number; // optional [0,1]
  error?: string; // optional error per item
}

export interface AiTranslateResponseBody {
  translations: Record<string, AiSuggestedTranslation[]>; // by target language code
}

export interface AiProviderConfig {
  provider: 'openai';
  model: string; // e.g., 'gpt-5-mini'
  apiKey: string;
}

export interface AiProvider {
  translateBatch(params: {
    sourceLanguage: string;
    targetLanguage: string;
    inputs: string[];
    glossary?: AiGlossaryTerm[];
    abortSignal?: AbortSignal;
  }): Promise<{ outputs: string[] }>; // same length as inputs
}


