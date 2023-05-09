import * as vscode from 'vscode-languageserver-protocol';
import type * as html from 'vscode-html-languageservice';
import type { VirtualFile, FileRangeCapabilities } from '@volar/language-core';
import type { Mapping, Stack } from '@volar/source-map';

/**
 * Server request client
 */

export namespace FsReadFileRequest {
	export const type = new vscode.RequestType<vscode.DocumentUri, Uint8Array | null | undefined, unknown>('volar/server/fs/readFile');
}

export namespace FsReadDirectoryRequest {
	export const type = new vscode.RequestType<vscode.DocumentUri, [string, html.FileType][], unknown>('volar/server/fs/readDirectory');
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

export namespace GetProjectsRequest {
	export type ParamsType = vscode.TextDocumentIdentifier;
	export type ResponseType = {
		rootUri: string;
		tsconfig?: string;
		isInferredProject: boolean;
		created: boolean;
		isSelected: boolean;
	}[] | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/projects');
}

export namespace GetProjectFilesRequest {
	export type ParamsType = { rootUri: string; tsconfig?: string; };
	export type ResponseType = string[] | null | undefined;
	export type ErrorType = never;
	export const type = new vscode.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/projectFiles');
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


export namespace ReportStats {
	export const type = new vscode.NotificationType0('volar/client/stats');
}
