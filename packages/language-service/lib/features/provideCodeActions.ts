import { findOverlapCodeRange, isCodeActionsEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { type URI } from 'vscode-uri';
import type { LanguageServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import * as dedupe from '../utils/dedupe';
import { getGeneratedRange, languageFeatureWorker } from '../utils/featureWorkers';
import { transformLocations, transformWorkspaceEdit } from '../utils/transform';
import type { ServiceDiagnosticData } from './provideDiagnostics';

export interface ServiceCodeActionData {
	uri: string;
	version: number;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	pluginIndex: number;
}

export function register(context: LanguageServiceContext) {
	return async (
		uri: URI,
		range: vscode.Range,
		codeActionContext: vscode.CodeActionContext,
		token = NoneCancellationToken,
	) => {
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return;
		}

		const transformedCodeActions = new WeakSet<vscode.CodeAction>();

		return await languageFeatureWorker(
			context,
			uri,
			() => ({ range, codeActionContext }),
			function*(docs) {
				const _codeActionContext: vscode.CodeActionContext = {
					diagnostics: transformLocations(
						codeActionContext.diagnostics,
						range => getGeneratedRange(docs, range),
					),
					only: codeActionContext.only,
				};
				const mapped = findOverlapCodeRange(
					docs[0].offsetAt(range.start),
					docs[0].offsetAt(range.end),
					docs[2],
					isCodeActionsEnabled,
				);
				if (mapped) {
					yield {
						range: {
							start: docs[1].positionAt(mapped.start),
							end: docs[1].positionAt(mapped.end),
						},
						codeActionContext: _codeActionContext,
					};
				}
			},
			async (plugin, document, { range, codeActionContext }) => {
				if (token.isCancellationRequested) {
					return;
				}
				const pluginIndex = context.plugins.indexOf(plugin);
				const diagnostics = codeActionContext.diagnostics.filter(diagnostic => {
					const data: ServiceDiagnosticData | undefined = diagnostic.data;
					if (data && data.version !== document.version) {
						return false;
					}
					return data?.pluginIndex === pluginIndex;
				}).map(diagnostic => {
					const data: ServiceDiagnosticData = diagnostic.data;
					return {
						...diagnostic,
						...data.original,
					};
				});

				const codeActions = await plugin[1].provideCodeActions?.(document, range, {
					...codeActionContext,
					diagnostics,
				}, token);

				codeActions?.forEach(codeAction => {
					if (plugin[1].resolveCodeAction) {
						codeAction.data = {
							uri: uri.toString(),
							version: document.version,
							original: {
								data: codeAction.data,
								edit: codeAction.edit,
							},
							pluginIndex: context.plugins.indexOf(plugin),
						} satisfies ServiceCodeActionData;
					}
					else {
						delete codeAction.data;
					}
				});

				if (codeActions && plugin[1].transformCodeAction) {
					for (let i = 0; i < codeActions.length; i++) {
						const transformed = plugin[1].transformCodeAction(codeActions[i]);
						if (transformed) {
							codeActions[i] = transformed;
							transformedCodeActions.add(transformed);
						}
					}
				}

				return codeActions;
			},
			actions =>
				actions
					.map(action => {
						if (transformedCodeActions.has(action)) {
							return action;
						}

						if (action.edit) {
							const edit = transformWorkspaceEdit(
								action.edit,
								context,
								'codeAction',
							);
							if (!edit) {
								return;
							}
							action.edit = edit;
						}

						return action;
					})
					.filter(action => !!action),
			arr => dedupe.withCodeAction(arr.flat()),
		);
	};
}
