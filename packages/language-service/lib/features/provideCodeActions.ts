import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { findOverlapCodeRange, notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { transformLocations, transformWorkspaceEdit } from '../utils/transform';
import type { ServiceDiagnosticData } from './provideDiagnostics';
import { isCodeActionsEnabled } from '@volar/language-core';
import { URI } from 'vscode-uri';

export interface ServiceCodeActionData {
	uri: string;
	version: number;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (_uri: string, range: vscode.Range, codeActionContext: vscode.CodeActionContext, token = NoneCancellationToken) => {
		const uri = URI.parse(_uri);
		const sourceScript = context.language.scripts.get(uri);
		if (!sourceScript) {
			return;
		}

		const transformedCodeActions = new WeakSet<vscode.CodeAction>();

		return await languageFeatureWorker(
			context,
			_uri,
			() => ({ range, codeActionContext }),
			function* (map) {
				const _codeActionContext: vscode.CodeActionContext = {
					diagnostics: transformLocations(
						codeActionContext.diagnostics,
						range => map.getGeneratedRange(range),
					),
					only: codeActionContext.only,
				};
				const mapped = findOverlapCodeRange(
					map.sourceDocument.offsetAt(range.start),
					map.sourceDocument.offsetAt(range.end),
					map.map,
					isCodeActionsEnabled,
				);
				if (mapped) {
					yield {
						range: {
							start: map.embeddedDocument.positionAt(mapped.start),
							end: map.embeddedDocument.positionAt(mapped.end),
						},
						codeActionContext: _codeActionContext,
					};
				}
			},
			async (service, document, { range, codeActionContext }) => {
				if (token.isCancellationRequested) {
					return;
				}
				const serviceIndex = context.services.indexOf(service);
				const diagnostics = codeActionContext.diagnostics.filter(diagnostic => {
					const data: ServiceDiagnosticData | undefined = diagnostic.data;
					if (data && data.version !== document.version) {
						return false;
					}
					return data?.serviceIndex === serviceIndex;
				}).map(diagnostic => {
					const data: ServiceDiagnosticData = diagnostic.data;
					return {
						...diagnostic,
						...data.original,
					};
				});

				const codeActions = await service[1].provideCodeActions?.(document, range, {
					...codeActionContext,
					diagnostics,
				}, token);

				codeActions?.forEach(codeAction => {
					codeAction.data = {
						uri: _uri,
						version: document.version,
						original: {
							data: codeAction.data,
							edit: codeAction.edit,
						},
						serviceIndex: context.services.indexOf(service),
					} satisfies ServiceCodeActionData;
				});

				if (codeActions && service[1].transformCodeAction) {
					for (let i = 0; i < codeActions.length; i++) {
						const transformed = service[1].transformCodeAction(codeActions[i]);
						if (transformed) {
							codeActions[i] = transformed;
							transformedCodeActions.add(transformed);
						}
					}
				}

				return codeActions;
			},
			actions => actions
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
				.filter(notEmpty),
			arr => dedupe.withCodeAction(arr.flat()),
		);
	};
}
