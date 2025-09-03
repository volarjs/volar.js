export * from './lib/types';
export * from './protocol';

// only export types of depend packages
export * from '@volar/language-core/lib/types';
export * from '@volar/language-service/lib/types';
export * from 'vscode-languageserver';
