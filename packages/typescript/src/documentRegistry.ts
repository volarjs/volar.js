import type * as ts from 'typescript/lib/tsserverlibrary.js';

const documentRegistries: [boolean, string, ts.DocumentRegistry][] = [];

export function getDocumentRegistry(ts: typeof import('typescript/lib/tsserverlibrary.js'), useCaseSensitiveFileNames: boolean, currentDirectory: string) {
	let documentRegistry = documentRegistries.find(item => item[0] === useCaseSensitiveFileNames && item[1] === currentDirectory)?.[2];
	if (!documentRegistry) {
		documentRegistry = ts.createDocumentRegistry(useCaseSensitiveFileNames, currentDirectory);
		documentRegistries.push([useCaseSensitiveFileNames, currentDirectory, documentRegistry]);
	}
	return documentRegistry;
}
