export function estimateAiTranslationWork(params: {
  sourceCharacters: number;
  glossaryCharacters: number;
  targetLanguageCount: number;
  batchCount: number;
}): number {
  const sourceWork = params.sourceCharacters * params.targetLanguageCount;
  const glossaryWork = params.glossaryCharacters * params.targetLanguageCount * params.batchCount;

  return sourceWork + glossaryWork;
}
