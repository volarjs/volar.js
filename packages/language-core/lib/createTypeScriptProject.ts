import { createFileProvider } from './createFileProvider';
import { Language, TypeScriptProjectHost, Project } from './types';

export function createTypeScriptProject(
	languages: Language<any>[],
	projectHost: TypeScriptProjectHost,
	{ idToFileName, getLanguageId }: {
		idToFileName(id: string): string;
		getLanguageId(id: string): string;
	},
): Project {

	for (const language of languages) {
		if (language.typescript?.resolveProjectHost) {
			projectHost = language.typescript.resolveProjectHost(projectHost);
		}
	}

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

	return {
		fileProvider,
		typescript: {
			projectHost,
		},
	};
}
