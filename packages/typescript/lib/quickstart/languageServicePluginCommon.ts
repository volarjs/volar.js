import { VirtualCode, createLanguage, FileMap } from '@volar/language-core';
import { LanguagePlugin } from '@volar/language-core/lib/types';
import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';
import { searchExternalFiles } from '../node/decorateLanguageServiceHost';

export const externalFiles = new WeakMap<ts.server.Project, string[]>();
export const projectExternalFileExtensions = new WeakMap<ts.server.Project, string[]>();
export const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
export const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

function arrayItemsEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	for (const file of b) {
		if (!set.has(file)) {
			return false;
		}
	}
	return true;
}

/**
 * Wrap `getScriptInfo` to handle large files that may crash the language service.
 *
 * Introduced to fix issues with converting `relatedInformation` (in Diagnostics)
 * when working with large files.
 *
 * https://github.com/volarjs/volar.js/commit/e242709a91e9d2919dc4fa59278dd266fd11e7a3
 */
export function makeGetScriptInfoWithLargeFileFailsafe(info: ts.server.PluginCreateInfo) {
	return (fileName: string) => {
		// getSnapshot could be crashed if the file is too large
		try {
			return info.project.getScriptInfo(fileName);
		} catch { }
	};
}

export function createLanguageCommon(
	languagePlugins: LanguagePlugin<string, VirtualCode>[],
	ts: typeof import('typescript'),
	info: ts.server.PluginCreateInfo) {
	const getScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(info.languageServiceHost);
	const getScriptInfo = makeGetScriptInfoWithLargeFileFailsafe(info);

	const language = createLanguage<string>(
		[
			...languagePlugins,
			{ getLanguageId: resolveFileLanguageId },
		],
		new FileMap(ts.sys.useCaseSensitiveFileNames),
		(fileName, _, shouldRegister) => {
			let snapshot: ts.IScriptSnapshot | undefined;
			if (shouldRegister) {
				// We need to trigger registration of the script file with the project, see #250
				snapshot = getScriptSnapshot(fileName);
			}
			else {
				snapshot = getScriptInfo(fileName)?.getSnapshot();
				if (!snapshot) {
					// trigger projectService.getOrCreateScriptInfoNotOpenedByClient
					info.project.getScriptVersion(fileName);
					snapshot = getScriptInfo(fileName)?.getSnapshot();
				}
			}
			if (snapshot) {
				language.scripts.set(fileName, snapshot);
			}
			else {
				language.scripts.delete(fileName);
			}
		}
	);

	return language;
}

export const makeGetExternalFiles = (ts: typeof import('typescript')) => (project: ts.server.Project, updateLevel = 0) => {
	if (updateLevel >= (1 satisfies ts.ProgramUpdateLevel.RootNamesAndUpdate)
		|| !externalFiles.has(project)) {
		const oldFiles = externalFiles.get(project);
		const extensions = projectExternalFileExtensions.get(project);
		const newFiles = extensions?.length ? searchExternalFiles(ts, project, extensions) : [];
		externalFiles.set(project, newFiles);
		if (oldFiles && !arrayItemsEqual(oldFiles, newFiles)) {
			project.refreshDiagnostics();
		}
	}
	return externalFiles.get(project)!;
};

