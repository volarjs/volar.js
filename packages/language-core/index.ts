export * from './lib/editorFeatures';
export * from './lib/fileProvider';
export * from './lib/linkedCodeMap';
export * from './lib/types';
export * from './lib/utils';
export * from '@volar/source-map';

export function resolveCommonLanguageId(fileNameOrUri: string) {
	const ext = fileNameOrUri.split('.').pop()!;
	switch (ext) {
		case 'js': return 'javascript';
		case 'cjs': return 'javascript';
		case 'mjs': return 'javascript';
		case 'ts': return 'typescript';
		case 'cts': return 'typescript';
		case 'mts': return 'typescript';
		case 'jsx': return 'javascriptreact';
		case 'tsx': return 'typescriptreact';
		case 'pug': return 'jade';
		case 'md': return 'markdown';
	}
	return ext;
}
