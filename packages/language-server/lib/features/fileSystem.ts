import { createUriMap, type FileSystem } from '@volar/language-service';
import * as vscode from 'vscode-languageserver';
import { URI } from 'vscode-uri';

export function register(
	documents: ReturnType<typeof import('./textDocuments').register>,
	fileWatcher: ReturnType<typeof import('./fileWatcher').register>,
) {
	const providers = new Map<string, FileSystem>();
	const readFileCache = createUriMap<ReturnType<FileSystem['readFile']>>();
	const statCache = createUriMap<ReturnType<FileSystem['stat']>>();
	const readDirectoryCache = createUriMap<ReturnType<FileSystem['readDirectory']>>();

	documents.onDidSave(({ document }) => {
		const uri = URI.parse(document.uri);
		readFileCache.set(uri, document.getText());
		statCache.delete(uri);
	});

	fileWatcher.onDidChangeWatchedFiles(({ changes }) => {
		for (const change of changes) {
			const changeUri = URI.parse(change.uri);
			const dir = URI.parse(change.uri.substring(0, change.uri.lastIndexOf('/')));
			if (change.type === vscode.FileChangeType.Deleted) {
				readFileCache.set(changeUri, undefined);
				statCache.set(changeUri, undefined);
				readDirectoryCache.delete(dir);
			}
			else if (change.type === vscode.FileChangeType.Changed) {
				readFileCache.delete(changeUri);
				statCache.delete(changeUri);
			}
			else if (change.type === vscode.FileChangeType.Created) {
				readFileCache.delete(changeUri);
				statCache.delete(changeUri);
				readDirectoryCache.delete(dir);
			}
		}
	});

	return {
		readFile(uri: URI) {
			if (!readFileCache.has(uri)) {
				readFileCache.set(uri, providers.get(uri.scheme)?.readFile(uri));
			}
			return readFileCache.get(uri)!;
		},
		stat(uri: URI) {
			if (!statCache.has(uri)) {
				statCache.set(uri, providers.get(uri.scheme)?.stat(uri));
			}
			return statCache.get(uri)!;
		},
		readDirectory(uri: URI) {
			if (!readDirectoryCache.has(uri)) {
				readDirectoryCache.set(uri, providers.get(uri.scheme)?.readDirectory(uri) ?? []);
			}
			return readDirectoryCache.get(uri)!;
		},
		install(scheme: string, provider: FileSystem) {
			providers.set(scheme, provider);
		},
	};
}
