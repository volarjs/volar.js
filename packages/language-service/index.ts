export * from '@volar/language-core';
export * from './lib/baseLanguageService';
export * from './lib/documents';
export { mergeWorkspaceEdits } from './lib/languageFeatures/rename';
export * from './lib/types';
export * as transformer from './lib/utils/transform';

import type * as vscode from 'vscode-languageserver-protocol';

// https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide#standard-token-types-and-modifiers
export const standardSemanticTokensLegend: vscode.SemanticTokensLegend = {
	tokenTypes: [
		'namespace',
		'class',
		'enum',
		'interface',
		'struct',
		'typeParameter',
		'type',
		'parameter',
		'variable',
		'property',
		'enumMember',
		'decorator',
		'event',
		'function',
		'method',
		'macro',
		'label',
		'comment',
		'string',
		'keyword',
		'number',
		'regexp',
		'operator',
	],
	tokenModifiers: [
		'declaration',
		'definition',
		'readonly',
		'static',
		'deprecated',
		'abstract',
		'async',
		'modification',
		'documentation',
		'defaultLibrary',
	],
};
