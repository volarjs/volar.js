import type { CodeMapping } from '@volar/language-core';
import type { DocumentDropEdit } from '@volar/language-service';
import * as protocol from 'vscode-languageserver-protocol';

export * from 'vscode-languageserver-protocol';

/**
 * Client request server
 */

export namespace FindFileReferenceRequest {
	export type ParamsType = {
		textDocument: protocol.TextDocumentIdentifier;
	};
	export type ResponseType = protocol.Location[] | null | undefined;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/findFileReference');
}

export namespace GetMatchTsConfigRequest {
	export type ParamsType = protocol.TextDocumentIdentifier;
	export type ResponseType = { uri: string } | null | undefined;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/tsconfig');
}

export namespace AutoInsertRequest {
	export type ParamsType = {
		textDocument: protocol.TextDocumentIdentifier;
		selection: protocol.Position;
		change: {
			rangeOffset: number;
			rangeLength: number;
			text: string;
		};
	};
	export type ResponseType = string | null | undefined;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/autoInsert');
}

export namespace ReloadProjectNotification {
	export const type = new protocol.NotificationType<protocol.TextDocumentIdentifier>('volar/client/reloadProject');
}

/**
 * Document Drop
 */

export namespace DocumentDropRequest {
	export type ParamsType = protocol.TextDocumentPositionParams & {
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
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/documentDrop');
}

export namespace DocumentDrop_DataTransferItemAsStringRequest {
	export type ParamsType = {
		mimeType: string;
	};
	export type ResponseType = string;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>(
		'volar/client/documentDrop/asString',
	);
}

export namespace DocumentDrop_DataTransferItemFileDataRequest {
	export type ParamsType = {
		mimeType: string;
	};
	export type ResponseType = Uint8Array;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>(
		'volar/client/documentDrop/fileData',
	);
}

/**
 * Labs
 */

export namespace UpdateVirtualCodeStateNotification {
	export type ParamsType = {
		fileUri: string;
		virtualCodeId: string;
		disabled: boolean;
	};
	export const type = new protocol.NotificationType<ParamsType>('volar/client/labs/updateVirtualFileState');
}

export namespace UpdateServicePluginStateNotification {
	export type ParamsType = {
		uri: string;
		serviceId: number;
		disabled: boolean;
	};
	export const type = new protocol.NotificationType<ParamsType>('volar/client/labs/updateServicePluginState');
}

export namespace GetServicePluginsRequest {
	export type ParamsType = protocol.TextDocumentIdentifier;
	export type ResponseType =
		| {
			id: number;
			name?: string;
			features: string[];
			disabled: boolean;
		}[]
		| null
		| undefined;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/servicePlugins');
}

export namespace GetVirtualFileRequest {
	export type VirtualCodeInfo = {
		fileUri: string;
		virtualCodeId: string;
		languageId: string;
		version: number;
		disabled: boolean;
		embeddedCodes: VirtualCodeInfo[];
	};
	export type ParamsType = protocol.TextDocumentIdentifier;
	export type ResponseType = VirtualCodeInfo | null | undefined;
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/virtualFiles');
}

export namespace GetVirtualCodeRequest {
	export type ParamsType = {
		fileUri: string;
		virtualCodeId: string;
	};
	export type ResponseType = {
		content: string;
		mappings: Record<string, CodeMapping[]>;
	};
	export type ErrorType = never;
	export const type = new protocol.RequestType<ParamsType, ResponseType, ErrorType>('volar/client/virtualFile');
}
