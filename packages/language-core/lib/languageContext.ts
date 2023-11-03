import { createVirtualFiles } from './virtualFiles';
import { Language, TypeScriptLanguageHost } from './types';
import type * as ts from 'typescript/lib/tsserverlibrary';

export interface LanguageContext {
	rawHost: TypeScriptLanguageHost;
	host: TypeScriptLanguageHost;
	virtualFiles: ReturnType<typeof createVirtualFiles>;
}

export function createLanguageContext(rawHost: TypeScriptLanguageHost, languages: Language<any>[]): LanguageContext {

	let host = rawHost;
	let lastRootFiles = new Map<string, ts.IScriptSnapshot | undefined>();
	let lastProjectVersion: number | string | undefined;

	const virtualFiles = createVirtualFiles(languages);

	for (const language of languages.reverse()) {
		if (language.resolveHost) {
			const pastHost = host;
			let proxyHost = language.resolveHost(host);
			if (proxyHost === pastHost) {
				console.warn(`[volar] language.resolveHost() should not return the same host instance.`);
				proxyHost = { ...proxyHost };
			}
			host = new Proxy(proxyHost, {
				get(target, p) {
					if (p in target) {
						return (target as any)[p];
					}
					return (pastHost as any)[p];
				}
			});
		}
	}

	return {
		rawHost,
		host,
		virtualFiles: new Proxy(virtualFiles, {
			get: (target, property) => {
				syncVirtualFiles();
				return target[property as keyof typeof virtualFiles];
			},
		}),
	};

	function syncVirtualFiles() {

		const newProjectVersion = host.getProjectVersion();
		const shouldUpdate = newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate)
			return;

		const nowRootFiles = new Map<string, ts.IScriptSnapshot | undefined>();
		const remainRootFiles = new Set(lastRootFiles.keys());

		for (const rootFileName of host.getScriptFileNames()) {
			nowRootFiles.set(rootFileName, host.getScriptSnapshot(rootFileName));
		}

		for (const [fileName, snapshot] of nowRootFiles) {
			remainRootFiles.delete(fileName);
			if (lastRootFiles.get(fileName) !== nowRootFiles.get(fileName)) {
				if (snapshot) {
					virtualFiles.updateSource(fileName, snapshot, host.getLanguageId?.(fileName));
				}
				else {
					virtualFiles.deleteSource(fileName);
				}
			}
		}

		for (const fileName of remainRootFiles) {
			virtualFiles.deleteSource(fileName);
		}

		lastRootFiles = nowRootFiles;
		lastProjectVersion = newProjectVersion;
	}
}
