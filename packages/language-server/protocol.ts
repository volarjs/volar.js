import type { CodeMapping, Stack } from '@volar/language-core';
import type { FileStat, FileType, DocumentDropEdit } from '@volar/language-service';
import * as vscode from 'vscode-languageserver-protocol';

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
		lastChange: {
			range: vscode.Range;
			text: string;
		};
	};
	export type ResponseType = string | vscode.TextEdit | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/autoInsert');
}

export namespace WriteVirtualFilesNotification {
	export const type = new vscode.NotificationType<vscode.TextDocumentIdentifier>('volar/client/writeVirtualFiles');
}

export namespace ReloadProjectNotification {
	export const type = new vscode.NotificationType<vscode.TextDocumentIdentifier>('volar/client/reloadProject');
}

/**
 * Document Drop
 */

export namespace DocumentDropRequest {
	export type ParamsType = vscode.TextDocumentPositionParams & {
		dataTransfer: {
			mimeType: string;
			value: any;
			file?: {
				name: string;
				uri?: string;
			};
		}[];
	};
	export type ResponseType = DocumentDropEdit | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/documentDrop');
}

export namespace DocumentDrop_DataTransferItemAsStringRequest {
	export type ParamsType = {
		mimeType: string;
	};
	export type ResponseType = string;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/documentDrop/asString');
}

export namespace DocumentDrop_DataTransferItemFileDataRequest {
	export type ParamsType = {
		mimeType: string;
	};
	export type ResponseType = Uint8Array;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/documentDrop/fileData');
}

/**
 * Labs
 */

export namespace UpdateVirtualFileStateNotification {
	export type ParamsType = {
		uri: string;
		virtualFileName: string;
		disabled: boolean;
	};
	export const type = new vscode.NotificationType<ParamsType>('volar/client/labs/updateVirtualFileState');
}

export namespace UpdateServicePluginStateNotification {
	export type ParamsType = {
		uri: string;
		serviceId: string;
		disabled: boolean;
	};
	export const type = new vscode.NotificationType<ParamsType>('volar/client/labs/updateServicePluginState');
}

export namespace GetServicePluginsRequest {
	export type ParamsType = vscode.TextDocumentIdentifier;
	export type ResponseType = {
		id: string;
		name?: string;
		features: string[];
		disabled: boolean;
	}[] | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/servicePlugins');
}

export namespace GetVirtualFilesRequest {
	export type VirtualFileWithState = {
		fileName: string;
		languageId: string;
		tsScriptKind?: number;
		version: number;
		disabled: boolean;
		embeddedFiles: VirtualFileWithState[];
	};
	export type ParamsType = vscode.TextDocumentIdentifier;
	export type ResponseType = VirtualFileWithState | null | undefined;
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
		mappings: Record<string, CodeMapping[]>;
		codegenStacks: Stack[];
	};
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/virtualFile');
}

export namespace LoadedTSFilesMetaRequest {
	export const type = new vscode.RequestType0('volar/client/loadedTsFiles');
}
