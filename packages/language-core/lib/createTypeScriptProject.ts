import { createFileProvider } from './createFileProvider';
import { Language, TypeScriptProjectHost, Project } from './types';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function createTypeScriptProject(
	languages: Language<any>[],
	projectHost: TypeScriptProjectHost,
	fileNameToId: (fileName: string) => string,
	getLanguageId: (fileName: string) => string
): Project {

	for (const language of languages) {
		if (language.resolveTypeScriptProjectHost) {
			projectHost = language.resolveTypeScriptProjectHost(projectHost);
		}
	}

	let lastRootFiles = new Map<string, ts.IScriptSnapshot | undefined>();
	let lastProjectVersion: string | undefined;

	const fileProvider = createFileProvider(languages, () => {

		const newProjectVersion = projectHost.getProjectVersion?.();
		const shouldUpdate = newProjectVersion == undefined || newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate)
			return;

		const newRootFiles = new Map<string, ts.IScriptSnapshot | undefined>();
		const remainRootFiles = new Set(lastRootFiles.keys());

		for (const rootFileName of projectHost.getScriptFileNames()) {
			newRootFiles.set(rootFileName, projectHost.getScriptSnapshot(rootFileName));
		}

		for (const [fileName, snapshot] of newRootFiles) {
			remainRootFiles.delete(fileName);
			if (lastRootFiles.get(fileName) !== newRootFiles.get(fileName)) {
				const id = fileNameToId(fileName);
				if (snapshot) {
					fileProvider.updateSourceFile(id, snapshot, getLanguageId(fileName));
				}
				else {
					fileProvider.deleteSourceFile(id);
				}
			}
		}

		for (const fileName of remainRootFiles) {
			const id = fileNameToId(fileName);
			fileProvider.deleteSourceFile(id);
		}

		lastRootFiles = newRootFiles;
		lastProjectVersion = newProjectVersion;
	});

	return {
		fileProvider,
		typescript: {
			projectHost,
		},
	};
}
