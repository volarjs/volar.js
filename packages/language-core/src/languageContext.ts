import { createVirtualFiles } from './virtualFiles';
import { Language, TypeScriptLanguageHost } from './types';

export interface LanguageContext {
	rawHost: TypeScriptLanguageHost;
	host: TypeScriptLanguageHost;
	virtualFiles: ReturnType<typeof createVirtualFiles>;
};

export function createLanguageContext(rawHost: TypeScriptLanguageHost, languages: Language<any>[]): LanguageContext {

	let host = rawHost;

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

	let lastProjectVersion: number | string | undefined;

	const virtualFiles = createVirtualFiles(languages);

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

		lastProjectVersion = newProjectVersion;

		const remainRootFiles = new Set(host.getScriptFileNames());

		for (const { fileName, snapshot } of virtualFiles.allSources()) {
			remainRootFiles.delete(fileName);

			const newSnapshot = host.getScriptSnapshot(fileName);
			if (!newSnapshot) {
				// delete
				virtualFiles.deleteSource(fileName);
			}
			else if (newSnapshot !== snapshot) {
				// update
				virtualFiles.updateSource(fileName, newSnapshot, host.getLanguageId?.(fileName));
			}
		}

		// create
		for (const fileName of [...remainRootFiles]) {
			const snapshot = host.getScriptSnapshot(fileName);
			if (snapshot) {
				virtualFiles.updateSource(fileName, snapshot, host.getLanguageId?.(fileName));
			}
		}
	}
}
