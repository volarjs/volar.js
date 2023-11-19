import { createFileProvider, Language, TypeScriptProjectHost, Project } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';
import { createLanguageServiceHost } from './createLanguageServiceHost';

export function createProject(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	sys: ts.System & {
		version?: number;
	},
	languages: Language<any>[],
	configFileName: string | undefined,
	projectHost: TypeScriptProjectHost,
	{ fileNameToId, idToFileName, getLanguageId }: {
		fileNameToId(fileName: string): string;
		idToFileName(id: string): string;
		getLanguageId(id: string): string;
	},
): Project {

	const fileProvider = createFileProvider(languages, (id) => {
		const fileName = idToFileName(id);
		const snapshot = projectHost.getScriptSnapshot(fileName);
		if (snapshot) {
			fileProvider.updateSourceFile(id, snapshot, getLanguageId(id));
		}
		else {
			fileProvider.deleteSourceFile(id);
		}
	});
	let languageServiceHost = createLanguageServiceHost(ts, sys, projectHost, fileProvider, { fileNameToId, idToFileName });

	for (const language of languages) {
		if (language.typescript?.resolveLanguageServiceHost) {
			languageServiceHost = language.typescript.resolveLanguageServiceHost(languageServiceHost);
		}
	}

	return {
		fileProvider,
		typescript: {
			configFileName,
			sys,
			languageServiceHost,
		},
	};
}
