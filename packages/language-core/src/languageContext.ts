import { createVirtualFiles } from './virtualFiles';
import { Language, LanguageServiceHost } from './types';

export type LanguageContext = ReturnType<typeof createLanguageContext>;

export function createLanguageContext(host: LanguageServiceHost, languages: Language[]) {

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

	let lastProjectVersion: string | undefined;

	const virtualFiles = createVirtualFiles(languages);
	const sourceFileVersions = new Map<string, string>();

	return {
		host,
		virtualFiles: new Proxy(virtualFiles, {
			get: (target, property) => {
				syncVirtualFiles();
				return target[property as keyof typeof virtualFiles];
			},
		}),
		syncVirtualFiles,
	};

	function syncVirtualFiles() {

		const newProjectVersion = host.getProjectVersion?.();
		const shouldUpdate = newProjectVersion === undefined || newProjectVersion !== lastProjectVersion;
		if (!shouldUpdate)
			return;

		lastProjectVersion = newProjectVersion;

		const remainRootFiles = new Set(host.getScriptFileNames());

		for (const { fileName } of virtualFiles.allSources()) {
			remainRootFiles.delete(fileName);

			const snapshot = host.getScriptSnapshot(fileName);
			if (!snapshot) {
				// delete
				virtualFiles.deleteSource(fileName);
				continue;
			}

			const newVersion = host.getScriptVersion(fileName);
			if (sourceFileVersions.get(fileName) !== newVersion) {
				// update
				sourceFileVersions.set(fileName, newVersion);
				virtualFiles.updateSource(fileName, snapshot, host.getScriptLanguageId?.(fileName));
			}
		}

		// create
		for (const fileName of [...remainRootFiles]) {
			const snapshot = host.getScriptSnapshot(fileName);
			if (snapshot) {
				virtualFiles.updateSource(fileName, snapshot, host.getScriptLanguageId?.(fileName));
			}
		}
	}
}
