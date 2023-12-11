import * as _ from '@volar/language-server/node';
import * as assert from 'assert';
import * as cp from 'child_process';
import * as fs from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

export type LanguageServerHandle = ReturnType<typeof startLanguageServer>;

export function startLanguageServer(serverModule: string, cwd?: string | URL) {

	const childProcess = cp.fork(
		serverModule,
		['--node-ipc', `--clientProcessId=${process.pid.toString()}`],
		{
			execArgv: ['--nolazy'],
			env: process.env,
			cwd,
		}
	);
	const connection = _.createProtocolConnection(
		new _.IPCMessageReader(childProcess),
		new _.IPCMessageWriter(childProcess)
	);
	const openedDocuments = new Map<string, TextDocument>();

	let untitledCounter = 0;

	connection.listen();
	connection.onClose((e) => console.log(e));
	connection.onUnhandledNotification((e) => console.log(e));
	connection.onError((e) => console.log(e));
	connection.onDispose(() => {
		childProcess.kill();
	});

	return {
		process: childProcess,
		connection,
		async initialize(rootUri: string, initializationOptions: _.InitializationOptions) {
			const result = await connection.sendRequest(
				_.InitializeRequest.type,
				{
					processId: childProcess.pid ?? null,
					rootUri,
					capabilities: {},
					initializationOptions,
				} satisfies _.InitializeParams
			);
			await connection.sendNotification(
				_.InitializedNotification.type,
				{} satisfies _.InitializedParams
			);
			return result;
		},
		async openTextDocument(fileName: string, languageId: string) {
			const uri = URI.file(fileName).toString();
			if (!openedDocuments.has(uri)) {
				const document = TextDocument.create(uri, languageId, 0, fs.readFileSync(fileName, 'utf-8'));
				openedDocuments.set(uri, document);
				await connection.sendNotification(
					_.DidOpenTextDocumentNotification.type,
					{
						textDocument: {
							uri,
							languageId,
							version: document.version,
							text: document.getText(),
						},
					} satisfies _.DidOpenTextDocumentParams
				);
			}
			return openedDocuments.get(uri)!;
		},
		async openUntitledDocument(content: string, languageId: string) {
			const uri = URI.from({ scheme: 'untitled', path: `Untitled-${untitledCounter++}` }).toString();
			const document = TextDocument.create(uri, languageId, 0, content);
			openedDocuments.set(uri, document);
			await connection.sendNotification(
				_.DidOpenTextDocumentNotification.type,
				{
					textDocument: {
						uri,
						languageId,
						version: document.version,
						text: document.getText(),
					},
				} satisfies _.DidOpenTextDocumentParams
			);
			return document;
		},
		closeTextDocument(uri: string) {
			assert(openedDocuments.has(uri));
			openedDocuments.delete(uri);
			return connection.sendNotification(
				_.DidCloseTextDocumentNotification.type,
				{
					textDocument: { uri },
				} satisfies _.DidCloseTextDocumentParams
			);
		},
		async sendCompletionRequest(uri: string, position: _.Position) {
			const result = await connection.sendRequest(
				_.CompletionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.CompletionParams
			);
			// @volar/language-server only returns CompletionList
			assert(!Array.isArray(result));
			return result;
		},
		async sendCompletionResolveRequest(item: _.CompletionItem) {
			return connection.sendRequest(
				_.CompletionResolveRequest.type,
				item satisfies _.CompletionItem
			);
		},
		sendDocumentDiagnosticRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentDiagnosticRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentDiagnosticParams
			);
		},
		sendHoverRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.HoverRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.HoverParams
			);
		},
		sendDocumentFormattingRequest(uri: string, options: _.FormattingOptions) {
			return connection.sendRequest(
				_.DocumentFormattingRequest.type,
				{
					textDocument: { uri },
					options,
				} satisfies _.DocumentFormattingParams
			);
		},
		sendRenameRequest(uri: string, position: _.Position, newName: string) {
			return connection.sendRequest(
				_.RenameRequest.type,
				{
					textDocument: { uri },
					position,
					newName,
				} satisfies _.RenameParams
			);
		},
		sendPrepareRenameRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.PrepareRenameRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.PrepareRenameParams
			);
		},
		sendFoldingRangesRequest(uri: string) {
			return connection.sendRequest(
				_.FoldingRangeRequest.type,
				{
					textDocument: { uri },
				} satisfies _.FoldingRangeParams
			);
		},
		sendDocumentSymbolRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentSymbolRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentSymbolParams
			);
		},
		sendDocumentColorRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentColorRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentColorParams
			);
		},
		sendDefinitionRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.DefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.DefinitionParams
			);
		},
		sendTypeDefinitionRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.TypeDefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.TypeDefinitionParams
			);
		},
		sendReferencesRequest(uri: string, position: _.Position, context: _.ReferenceContext) {
			return connection.sendRequest(
				_.ReferencesRequest.type,
				{
					textDocument: { uri },
					position,
					context,
				} satisfies _.ReferenceParams
			);
		},
		sendSignatureHelpRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.SignatureHelpRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.SignatureHelpParams
			);
		},
		sendSelectionRangesRequest(uri: string, positions: _.Position[]) {
			return connection.sendRequest(
				_.SelectionRangeRequest.type,
				{
					textDocument: { uri },
					positions,
				} satisfies _.SelectionRangeParams
			);
		},
		sendCodeActionsRequest(uri: string, range: _.Range, context: _.CodeActionContext) {
			return connection.sendRequest(
				_.CodeActionRequest.type,
				{
					textDocument: { uri },
					range,
					context,
				} satisfies _.CodeActionParams
			);
		},
		sendCodeActionResolveRequest(codeAction: _.CodeAction) {
			return connection.sendRequest(
				_.CodeActionResolveRequest.type,
				codeAction satisfies _.CodeAction
			);
		},
		sendExecuteCommandRequest(command: string, args?: any[]) {
			return connection.sendRequest(
				_.ExecuteCommandRequest.type,
				{
					command,
					arguments: args,
				} satisfies _.ExecuteCommandParams
			);
		},
		sendSemanticTokensRequest(uri: string) {
			return connection.sendRequest(
				_.SemanticTokensRequest.type,
				{
					textDocument: { uri },
				} satisfies _.SemanticTokensParams
			);
		},
		sendSemanticTokensRangeRequest(uri: string, range: _.Range) {
			return connection.sendRequest(
				_.SemanticTokensRangeRequest.type,
				{
					textDocument: { uri },
					range,
				} satisfies _.SemanticTokensRangeParams
			);
		},
		sendColorPresentationRequest(uri: string, color: _.Color, range: _.Range) {
			return connection.sendRequest(
				_.ColorPresentationRequest.type,
				{
					textDocument: { uri },
					color,
					range,
				} satisfies _.ColorPresentationParams
			);
		},
		sendDocumentLinkRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentLinkRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentLinkParams
			);
		},
		sendDocumentLinkResolveRequest(link: _.DocumentLink) {
			return connection.sendRequest(
				_.DocumentLinkResolveRequest.type,
				link satisfies _.DocumentLink
			);
		},
	};
}
