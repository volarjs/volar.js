import { LanguageService, ServiceEnvironment, createFileProvider, createLanguageService } from '@volar/language-service';
import { SimpleServerPlugin, ServerProject } from '../types';
import { WorkspacesContext } from './simpleProjectProvider';
import { getConfig } from '../config';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { IncrementalScriptSnapshot } from '../documentManager';

export async function createSimpleServerProject(
	context: WorkspacesContext,
	plugins: ReturnType<SimpleServerPlugin>[],
	serviceEnv: ServiceEnvironment,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;
	let shouldUpdate = true;
	let lastSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();

	const { uriToFileName } = context.server.runtimeEnv;
	const config = await getConfig(context, plugins, serviceEnv, undefined);

	context.workspaces.documents.onDidChangeContent(() => {
		shouldUpdate = true;
	});
	context.workspaces.documents.onDidClose(() => {
		shouldUpdate = true;
	});

	return {
		serviceEnv,
		getLanguageService,
		getLanguageServiceDontCreate: () => languageService,
		dispose() {
			languageService?.dispose();
		},
	};

	function getLanguageService() {
		if (!languageService) {
			const fileProvider = createFileProvider(Object.values(config.languages ?? {}), () => {

				if (!shouldUpdate)
					return;

				shouldUpdate = false;

				const newSnapshots = new Map<string, IncrementalScriptSnapshot | undefined>();
				const remain = new Set(lastSnapshots.keys());

				for (const uri of context.workspaces.documents.data.uriKeys()) {
					newSnapshots.set(uri, context.workspaces.documents.data.uriGet(uri));
				}

				for (const [uri, snapshot] of newSnapshots) {
					remain.delete(uri);
					const newSnapshot = snapshot?.getSnapshot();
					if (lastSnapshots.get(uri) !== snapshot) {
						if (snapshot && newSnapshot) {
							fileProvider.updateSource(uriToFileName(uri), newSnapshot, snapshot.languageId);
						}
						else {
							fileProvider.deleteSource(uriToFileName(uri));
						}
					}
				}

				for (const uri of remain) {
					fileProvider.deleteSource(uriToFileName(uri));
				}

				const _newSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();

				for (const [uri, snapshot] of newSnapshots) {
					_newSnapshots.set(uri, snapshot?.getSnapshot());
				}

				lastSnapshots = _newSnapshots;
			});
			languageService = createLanguageService(
				{ typescript: context.workspaces.ts },
				Object.values(config.services ?? {}),
				serviceEnv,
				{ fileProvider },
			);
		}
		return languageService;
	}
}
