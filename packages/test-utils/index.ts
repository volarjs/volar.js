import { defaultMapperFactory, forEachEmbeddedCode } from '@volar/language-core';
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
		['--stdio', `--clientProcessId=${process.pid.toString()}`],
		{
			execArgv: ['--nolazy'],
			env: process.env,
			cwd,
			stdio: 'pipe',
		},
	);
	const connection = _.createProtocolConnection(
		childProcess.stdout!,
		childProcess.stdin!,
	);
	const documentVersions = new Map<string, number>();
	const openedDocuments = new Map<string, TextDocument>();
	const settings: any = {};

	let untitledCounter = 0;
	let running = false;

	connection.listen();
	connection.onClose(e => console.log(e));
	connection.onUnhandledNotification(e => console.log(e));
	connection.onError(e => console.log(e));
	connection.onNotification(_.LogMessageNotification.type, e => {
		if (e.type === _.MessageType.Error || e.type === _.MessageType.Warning) {
			console.error(e.message);
		}
		else {
			console.log(e.message);
		}
	});
	connection.onDispose(() => {
		connection.end();
	});
	connection.onRequest(_.ConfigurationRequest.type, ({ items }) => {
		return items.map(item => {
			if (item.section) {
				return getConfiguration(item.section);
			}
		});
	});

	return {
		process: childProcess,
		connection,
		async initialize(
			rootUri: string | _.WorkspaceFolder[],
			initializationOptions: _._InitializeParams['initializationOptions'],
			capabilities: _.ClientCapabilities = {},
			locale?: string,
		) {
			const result = await connection.sendRequest(
				_.InitializeRequest.type,
				{
					processId: childProcess.pid ?? null,
					rootUri: typeof rootUri === 'string' ? rootUri : null,
					workspaceFolders: Array.isArray(rootUri) ? rootUri : null,
					initializationOptions,
					capabilities,
					locale,
				} satisfies _.InitializeParams,
			);
			await connection.sendNotification(_.InitializedNotification.type, {} satisfies _.InitializedParams);
			running = true;
			return result;
		},
		async shutdown() {
			running = false;
			await connection.sendRequest(_.ShutdownRequest.type);
			openedDocuments.clear();
		},
		async openTextDocument(fileName: string, languageId: string) {
			const uri = URI.file(fileName).toString();
			if (!openedDocuments.has(uri)) {
				const document = TextDocument.create(
					uri,
					languageId,
					(documentVersions.get(uri) ?? 0) + 1,
					fs.readFileSync(fileName, 'utf-8'),
				);
				documentVersions.set(uri, document.version);
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
					} satisfies _.DidOpenTextDocumentParams,
				);
			}
			return openedDocuments.get(uri)!;
		},
		async openUntitledDocument(languageId: string, content: string) {
			const uri = URI.from({ scheme: 'untitled', path: `Untitled-${untitledCounter++}` }).toString();
			const document = TextDocument.create(
				uri,
				languageId,
				(documentVersions.get(uri) ?? 0) + 1,
				content,
			);
			documentVersions.set(uri, document.version);
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
				} satisfies _.DidOpenTextDocumentParams,
			);
			return document;
		},
		async openInMemoryDocument(uri: string, languageId: string, content: string) {
			const oldDocument = openedDocuments.get(uri);
			if (oldDocument) {
				await this.closeTextDocument(uri);
			}
			const document = TextDocument.create(
				uri,
				languageId,
				(documentVersions.get(uri) ?? 0) + 1,
				content,
			);
			documentVersions.set(uri, document.version);
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
				} satisfies _.DidOpenTextDocumentParams,
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
				} satisfies _.DidCloseTextDocumentParams,
			);
		},
		async updateTextDocument(uri: string, edits: _.TextEdit[]) {
			let document = openedDocuments.get(uri);
			assert(document);
			const newText = TextDocument.applyEdits(document, edits);
			document = TextDocument.create(uri, document.languageId, document.version + 1, newText);
			documentVersions.set(uri, document.version);
			openedDocuments.set(uri, document);
			await connection.sendNotification(
				_.DidChangeTextDocumentNotification.type,
				{
					textDocument: {
						uri: document.uri,
						version: document.version,
					},
					contentChanges: [{ text: document.getText() }],
				} satisfies _.DidChangeTextDocumentParams,
			);
			return document;
		},
		async updateConfiguration(newSettings: any) {
			Object.assign(settings, newSettings);
			if (running) {
				await connection.sendNotification(
					_.DidChangeConfigurationNotification.type,
					{ settings } satisfies _.DidChangeConfigurationParams,
				);
			}
		},
		didChangeWatchedFiles(changes: _.FileEvent[]) {
			return connection.sendNotification(
				_.DidChangeWatchedFilesNotification.type,
				{ changes } satisfies _.DidChangeWatchedFilesParams,
			);
		},
		async sendCompletionRequest(uri: string, position: _.Position) {
			const result = await connection.sendRequest(
				_.CompletionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.CompletionParams,
			);
			// @volar/language-server only returns CompletionList
			assert(!Array.isArray(result));
			return result;
		},
		sendCompletionResolveRequest(item: _.CompletionItem) {
			return connection.sendRequest(
				_.CompletionResolveRequest.type,
				item satisfies _.CompletionItem,
			);
		},
		sendDocumentDiagnosticRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentDiagnosticRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentDiagnosticParams,
			);
		},
		sendHoverRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.HoverRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.HoverParams,
			);
		},
		sendDocumentFormattingRequest(uri: string, options: _.FormattingOptions) {
			return connection.sendRequest(
				_.DocumentFormattingRequest.type,
				{
					textDocument: { uri },
					options,
				} satisfies _.DocumentFormattingParams,
			);
		},
		sendDocumentRangeFormattingRequestRequest(uri: string, range: _.Range, options: _.FormattingOptions) {
			return connection.sendRequest(
				_.DocumentRangeFormattingRequest.type,
				{
					textDocument: { uri },
					range,
					options,
				} satisfies _.DocumentRangeFormattingParams,
			);
		},
		sendRenameRequest(uri: string, position: _.Position, newName: string) {
			return connection.sendRequest(
				_.RenameRequest.type,
				{
					textDocument: { uri },
					position,
					newName,
				} satisfies _.RenameParams,
			);
		},
		sendPrepareRenameRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.PrepareRenameRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.PrepareRenameParams,
			);
		},
		sendFoldingRangesRequest(uri: string) {
			return connection.sendRequest(
				_.FoldingRangeRequest.type,
				{
					textDocument: { uri },
				} satisfies _.FoldingRangeParams,
			);
		},
		sendDocumentSymbolRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentSymbolRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentSymbolParams,
			);
		},
		sendDocumentColorRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentColorRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentColorParams,
			);
		},
		sendDefinitionRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.DefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.DefinitionParams,
			);
		},
		sendTypeDefinitionRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.TypeDefinitionRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.TypeDefinitionParams,
			);
		},
		sendReferencesRequest(uri: string, position: _.Position, context: _.ReferenceContext) {
			return connection.sendRequest(
				_.ReferencesRequest.type,
				{
					textDocument: { uri },
					position,
					context,
				} satisfies _.ReferenceParams,
			);
		},
		sendSignatureHelpRequest(uri: string, position: _.Position) {
			return connection.sendRequest(
				_.SignatureHelpRequest.type,
				{
					textDocument: { uri },
					position,
				} satisfies _.SignatureHelpParams,
			);
		},
		sendSelectionRangesRequest(uri: string, positions: _.Position[]) {
			return connection.sendRequest(
				_.SelectionRangeRequest.type,
				{
					textDocument: { uri },
					positions,
				} satisfies _.SelectionRangeParams,
			);
		},
		sendCodeActionsRequest(uri: string, range: _.Range, context: _.CodeActionContext) {
			return connection.sendRequest(
				_.CodeActionRequest.type,
				{
					textDocument: { uri },
					range,
					context,
				} satisfies _.CodeActionParams,
			);
		},
		sendCodeActionResolveRequest(codeAction: _.CodeAction) {
			return connection.sendRequest(
				_.CodeActionResolveRequest.type,
				codeAction satisfies _.CodeAction,
			);
		},
		sendExecuteCommandRequest(command: string, args?: any[]) {
			return connection.sendRequest(
				_.ExecuteCommandRequest.type,
				{
					command,
					arguments: args,
				} satisfies _.ExecuteCommandParams,
			);
		},
		sendSemanticTokensRequest(uri: string) {
			return connection.sendRequest(
				_.SemanticTokensRequest.type,
				{
					textDocument: { uri },
				} satisfies _.SemanticTokensParams,
			);
		},
		sendSemanticTokensRangeRequest(uri: string, range: _.Range) {
			return connection.sendRequest(
				_.SemanticTokensRangeRequest.type,
				{
					textDocument: { uri },
					range,
				} satisfies _.SemanticTokensRangeParams,
			);
		},
		sendColorPresentationRequest(uri: string, color: _.Color, range: _.Range) {
			return connection.sendRequest(
				_.ColorPresentationRequest.type,
				{
					textDocument: { uri },
					color,
					range,
				} satisfies _.ColorPresentationParams,
			);
		},
		sendDocumentLinkRequest(uri: string) {
			return connection.sendRequest(
				_.DocumentLinkRequest.type,
				{
					textDocument: { uri },
				} satisfies _.DocumentLinkParams,
			);
		},
		sendDocumentLinkResolveRequest(link: _.DocumentLink) {
			return connection.sendRequest(
				_.DocumentLinkResolveRequest.type,
				link satisfies _.DocumentLink,
			);
		},
		sendInlayHintRequest(uri: string, range: _.Range) {
			return connection.sendRequest(
				_.InlayHintRequest.type,
				{
					textDocument: { uri },
					range,
				} satisfies _.InlayHintParams,
			);
		},
		sendInlayHintResolveRequest(hint: _.InlayHint) {
			return connection.sendRequest(
				_.InlayHintResolveRequest.type,
				hint satisfies _.InlayHint,
			);
		},
	};

	function getConfiguration(section: string) {
		if (section in settings) {
			return settings[section];
		}
		let result: any;
		for (const settingKey in settings) {
			if (settingKey.startsWith(`${section}.`)) {
				const value = settings[settingKey];
				const props = settingKey.substring(section.length + 1).split('.');
				result ??= {};
				let current = result;
				while (props.length > 1) {
					const prop = props.shift()!;
					if (typeof current[prop] !== 'object') {
						current[prop] = {};
					}
					current = current[prop];
				}
				current[props.shift()!] = value;
			}
		}
		return result;
	}
}

export function* printSnapshots(sourceScript: _.SourceScript<URI>) {
	if (sourceScript.generated) {
		let lastId = 0;
		for (const file of forEachEmbeddedCode(sourceScript.generated.root)) {
			const id = lastId++;
			yield `#${id}`;
			for (const line of printSnapshot(sourceScript, file)) {
				yield '  ' + line;
			}
		}
	}
}

export function* printSnapshot(
	sourceScript: {
		snapshot: _.SourceScript<URI>['snapshot'];
	},
	file: _.VirtualCode,
) {
	const sourceCode = sourceScript.snapshot.getText(0, sourceScript.snapshot.getLength());
	const sourceFileDocument = TextDocument.create('', '', 0, sourceCode);
	const virtualCode = file.snapshot.getText(0, file.snapshot.getLength());
	const virtualCodeLines = virtualCode.split('\n');

	for (let i = 0; i < virtualCodeLines.length - 2; i++) {
		virtualCodeLines[i] += '\n';
	}

	let lineOffset = 0;

	const map = defaultMapperFactory(file.mappings);

	for (let i = 0; i < virtualCodeLines.length; i++) {
		const line = virtualCodeLines[i];
		const lineHead = `[${i + 1}]`;
		yield [lineHead, normalizeLogText(line)].join(' ');
		const logs: {
			mapping: _.CodeMapping;
			line: string;
			lineOffset: number;
			sourceOffset: number;
			generatedOffset: number;
			length: number;
		}[] = [];
		for (let offset = 0; offset < line.length; offset++) {
			for (const [sourceOffset, mapping] of map.toSourceLocation(lineOffset + offset)) {
				let log = logs.find(log => log.mapping === mapping && log.lineOffset + log.length + 1 === offset);
				if (log) {
					log.length++;
				}
				else {
					log = {
						mapping,
						line,
						lineOffset: offset,
						sourceOffset: sourceOffset,
						generatedOffset: offset,
						length: 0,
					};
					logs.push(log);
				}
			}
		}
		for (const log of logs.reverse()) {
			const sourcePosition = sourceFileDocument.positionAt(log.sourceOffset);
			const spanText = log.length === 0 ? '^' : '~'.repeat(log.length);
			const prefix = ' '.repeat(lineHead.length);
			const sourceLineEnd = sourceFileDocument.offsetAt({ line: sourcePosition.line + 1, character: 0 }) - 1;
			const sourceLine = sourceFileDocument.getText().substring(
				sourceFileDocument.offsetAt({ line: sourcePosition.line, character: 0 }),
				sourceLineEnd + 1,
			);
			const sourceLineHead = `[${sourcePosition.line + 1}]`;
			yield [
				prefix,
				' '.repeat(log.lineOffset),
				spanText,
			].join(' ');
			if (log.line === sourceLine) {
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					sourceLineHead,
					'(exact match)',
					`(${
						':' + (sourcePosition.line + 1)
						+ ':' + (sourcePosition.character + 1)
					})`,
				].join(' ');
			}
			else {
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					sourceLineHead,
					normalizeLogText(sourceLine),
					`(${
						':' + (sourcePosition.line + 1)
						+ ':' + (sourcePosition.character + 1)
					})`,
				].join(' ');
				yield [
					prefix,
					' '.repeat(log.lineOffset),
					' '.repeat(sourceLineHead.length),
					' '.repeat(sourcePosition.character) + spanText,
				].join(' ');
			}
		}
		lineOffset += line.length;
	}
}

function normalizeLogText(text: string) {
	return text
		.replace(/\t/g, '→')
		.replace(/\n/g, '↵')
		.replace(/ /g, '·');
}
