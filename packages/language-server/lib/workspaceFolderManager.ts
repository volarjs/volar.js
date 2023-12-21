import type { URI } from 'vscode-uri';

export type WorkspaceFolderManager = ReturnType<typeof createWorkspaceFolderManager>;

export function createWorkspaceFolderManager() {

	let folders: URI[] = [];

	const onDidAddCallbacks = new Set<(folder: URI) => void>();
	const onDidRemoveCallbacks = new Set<(folder: URI) => void>();

	return {
		add(folder: URI) {
			if (!folders.some((uri) => uri.toString() === folder.toString())) {
				folders.push(folder);
			}
		},
		remove(folder: URI) {
			folders = folders.filter((uri) => uri.toString() !== folder.toString());
		},
		getAll() {
			return folders;
		},
		onDidAdd(cb: (folder: URI) => void) {
			onDidAddCallbacks.add(cb);
			return {
				dispose() {
					onDidAddCallbacks.delete(cb);
				},
			};
		},
		onDidRemove(cb: (folder: URI) => void) {
			onDidRemoveCallbacks.add(cb);
			return {
				dispose() {
					onDidRemoveCallbacks.delete(cb);
				},
			};
		},
	};
}
