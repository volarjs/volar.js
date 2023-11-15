import { createFileProvider } from './createFileProvider';
import { Language, TypeScriptProjectHost, Project } from './types';

export function createTypeScriptProject(
	projectHost: TypeScriptProjectHost,
	languages: Language<any>[],
	getLanguageId: (fileName: string) => string,
): Project {

	for (const language of languages) {
		if (language.resolveTypeScriptProjectHost) {
			projectHost = language.resolveTypeScriptProjectHost(projectHost);
		}
	}

	const fileProvider = createFileProvider(languages, fileName => {
		const newSnapshot = projectHost.getScriptSnapshot(fileName);
		if (newSnapshot) {
			fileProvider.updateSource(fileName, newSnapshot, getLanguageId(fileName));
		}
		else {
			fileProvider.deleteSource(fileName);
		}
	});

	return {
		fileProvider,
		typeScriptProjectHost: projectHost,
	};
}
