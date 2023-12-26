import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getOverlapRange, notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { transformLocations, transformWorkspaceEdit } from '../utils/transform';
import type { ServiceDiagnosticData } from './provideDiagnostics';
import { isCodeActionsEnabled } from '@volar/language-core';

export interface ServiceCodeActionData {
	uri: string;
	version: number;
	original: Pick<vscode.CodeAction, 'data' | 'edit'>;
	serviceIndex: number;
}

export function register(context: ServiceContext) {

	return async (uri: string, range: vscode.Range, codeActionContext: vscode.CodeActionContext, token = NoneCancellationToken) => {

		const sourceFile = context.language.files.getSourceFile(context.env.uriToFileName(uri));
		if (!sourceFile) {
			return;
		}

		const document = context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
		const offsetRange = {
			start: document.offsetAt(range.start),
			end: document.offsetAt(range.end),
		};
		const transformedCodeActions = new WeakSet<vscode.CodeAction>();

		return await languageFeatureWorker(
			context,
			uri,
			() => ({ range, codeActionContext }),
			function* (map) {
				if (map.map.mappings.some(mapping => isCodeActionsEnabled(mapping.data))) {

					const _codeActionContext: vscode.CodeActionContext = {
						diagnostics: transformLocations(
							codeActionContext.diagnostics,
							range => map.getGeneratedRange(range),
						),
						only: codeActionContext.only,
					};

					let minStart: number | undefined;
					let maxEnd: number | undefined;

					for (const mapping of map.map.mappings) {
						const overlapRange = getOverlapRange(
							offsetRange.start,
							offsetRange.end,
							mapping.sourceOffsets[0],
							mapping.sourceOffsets[mapping.sourceOffsets.length - 1]
							+ mapping.lengths[mapping.lengths.length - 1]
						);
						if (overlapRange) {
							const start = map.map.getGeneratedOffset(overlapRange.start)?.[0];
							const end = map.map.getGeneratedOffset(overlapRange.end)?.[0];
							if (start !== undefined && end !== undefined) {
								minStart = minStart === undefined ? start : Math.min(start, minStart);
								maxEnd = maxEnd === undefined ? end : Math.max(end, maxEnd);
							}
						}
					}

					if (minStart !== undefined && maxEnd !== undefined) {
						yield {
							range: {
								start: map.virtualFileDocument.positionAt(minStart),
								end: map.virtualFileDocument.positionAt(maxEnd),
							},
							codeActionContext: _codeActionContext,
						};
					}
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
						uri,
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
