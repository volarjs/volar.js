import { VirtualCode, createLanguage, FileMap } from '@volar/language-core';
import { LanguagePlugin } from '@volar/language-core/lib/types';
import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';

export const externalFiles = new WeakMap<ts.server.Project, string[]>();
export const projectExternalFileExtensions = new WeakMap<ts.server.Project, string[]>();
export const decoratedLanguageServices = new WeakSet<ts.LanguageService>();
export const decoratedLanguageServiceHosts = new WeakSet<ts.LanguageServiceHost>();

export function arrayItemsEqual(a: string[], b: string[]) {
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

export function makeGetScriptInfo(info: ts.server.PluginCreateInfo) {
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
	const getScriptInfo = makeGetScriptInfo(info);

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

