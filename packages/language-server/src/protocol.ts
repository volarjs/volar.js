import * as vscode from 'vscode-languageserver-protocol';
import type { VirtualFile, FileRangeCapabilities } from '@volar/language-core';
import type { Mapping, Stack } from '@volar/source-map';
import type { FileStat, FileType } from '@volar/language-service';

/**
 * Server request client
 */

export namespace FsReadFileRequest {
	export const type = new vscode.RequestType<vscode.DocumentUri, string | null | undefined, unknown>('volar/server/fs/readFile');
}

export namespace FsReadDirectoryRequest {
	export const type = new vscode.RequestType<vscode.DocumentUri, [string, FileType][], unknown>('volar/server/fs/readDirectory');
}

export namespace FsStatRequest {
	export const type = new vscode.RequestType<vscode.DocumentUri, FileStat, unknown>('volar/server/fs/stat');
}

export namespace FsCacheRequest {
	export type ResponseType = {
		stat: [string, FileStat][];
		readDirectory: [string, [string, FileType][]][];
		readFile: [string, string][];
	} | null | undefined;
	export const type = new vscode.RequestType0<ResponseType, unknown>('volar/server/fs/cache');
}

export namespace UseReadFileCacheNotification {
	export const type = new vscode.NotificationType<vscode.DocumentUri>('volar/server/fs/readFile/cache');
}

export namespace UseReadDirectoryCacheNotification {
	export const type = new vscode.NotificationType<vscode.DocumentUri>('volar/server/fs/readDirectory/cache');
}

export namespace UseStatCacheNotification {
	export const type = new vscode.NotificationType<vscode.DocumentUri>('volar/server/fs/stat/cache');
}

/**
 * Client request server
 */

export namespace FindFileReferenceRequest {
	export type ParamsType = {
		textDocument: vscode.TextDocumentIdentifier;
	};
	export type ResponseType = vscode.Location[] | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/findFileReference');
}

export namespace GetMatchTsConfigRequest {
	export type ParamsType = vscode.TextDocumentIdentifier;
	export type ResponseType = { uri: string; } | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/tsconfig');
}

export namespace AutoInsertRequest {
	export type ParamsType = vscode.TextDocumentPositionParams & {
		options: {
			lastChange: {
				range: vscode.Range;
				rangeOffset: number;
				rangeLength: number;
				text: string;
			},
		},
	};
	export type ResponseType = string | vscode.TextEdit | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/autoInsert');
}

export namespace LoadedTSFilesMetaRequest {
	export const type = new vscode.RequestType0('volar/client/loadedTsFiles');
}

export namespace WriteVirtualFilesNotification {
	export const type = new vscode.NotificationType<vscode.TextDocumentIdentifier>('volar/client/writeVirtualFiles');
}

export namespace ReloadProjectNotification {
	export const type = new vscode.NotificationType<vscode.TextDocumentIdentifier>('volar/client/reloadProject');
}

export namespace GetVirtualFilesRequest {
	export type ParamsType = vscode.TextDocumentIdentifier;
	export type ResponseType = VirtualFile | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/virtualFiles');
}

export namespace GetVirtualFileRequest {
	export type ParamsType = {
		sourceFileUri: string;
		virtualFileName: string;
	};
	export type ResponseType = {
		content: string;
		mappings: Record<string, Mapping<FileRangeCapabilities>[]>;
		codegenStacks: Stack[];
	};
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/virtualFile');
}
