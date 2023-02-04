export * from '@volar/language-core';
export * from './baseLanguageService';
export * from './documents';
export { mergeWorkspaceEdits } from './languageFeatures/rename';
export * from './types';
export * as transformer from './transformer';
export { showReferencesCommand, ShowReferencesCommandData } from './languageFeatures/codeLensResolve';
