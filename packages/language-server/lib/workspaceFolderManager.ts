import { ServiceEnvironment } from "@volar/language-service";

export type WorkspaceFolderManager = ReturnType<typeof createWorkspaceFolderManager>;

export function createWorkspaceFolderManager() {

	let folders: ServiceEnvironment['workspaceFolder'][] = [];

	const onDidAddCallbacks = new Set<(folder: ServiceEnvironment['workspaceFolder']) => void>();
	const onDidRemoveCallbacks = new Set<(folder: ServiceEnvironment['workspaceFolder']) => void>();

	return {
		add(folder: ServiceEnvironment['workspaceFolder']) {
			if (!folders.some(({ uri }) => uri.toString() === folder.uri.toString())) {
				folders.push(folder);
			}
		},
		remove(folder: ServiceEnvironment['workspaceFolder']) {
			folders = folders.filter(({ uri }) => uri.toString() !== folder.uri.toString());
		},
		getAll() {
			return folders;
		},
		onDidAdd(cb: (folder: ServiceEnvironment['workspaceFolder']) => void) {
			onDidAddCallbacks.add(cb);
			return {
				dispose() {
					onDidAddCallbacks.delete(cb);
				},
			};
		},
		onDidRemove(cb: (folder: ServiceEnvironment['workspaceFolder']) => void) {
			onDidRemoveCallbacks.add(cb);
			return {
				dispose() {
					onDidRemoveCallbacks.delete(cb);
				},
			};
		},
	};
}
