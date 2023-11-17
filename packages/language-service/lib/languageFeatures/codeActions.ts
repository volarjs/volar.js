import * as transformer from '../transformer';
import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { getOverlapRange, notEmpty } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { embeddedEditToSourceEdit } from './rename';
import { ServiceDiagnosticData } from './validation';
import { NoneCancellationToken } from '../utils/cancellation';

export interface ServiceCodeActionData {
	uri: string,
	version: number,
	original: Pick<vscode.CodeAction, 'data' | 'edit'>,
	serviceIndex: number,
}

export function register(context: ServiceContext) {

	return async (uri: string, range: vscode.Range, codeActionContext: vscode.CodeActionContext, token = NoneCancellationToken) => {

		const sourceDocument = context.getTextDocument(uri);
		if (!sourceDocument)
			return;

		const offsetRange = {
			start: sourceDocument.offsetAt(range.start),
			end: sourceDocument.offsetAt(range.end),
		};
		const transformedCodeActions = new WeakSet<vscode.CodeAction>();
		const pluginActions = await languageFeatureWorker(
			context,
			uri,
			{ range, codeActionContext },
			(_arg, map, file) => {

				if (!file.capabilities.codeAction)
					return [];

				const _codeActionContext: vscode.CodeActionContext = {
					diagnostics: transformer.asLocations(
						codeActionContext.diagnostics,
						range => map.toGeneratedRange(range),
					),
					only: codeActionContext.only,
				};

				let minStart: number | undefined;
				let maxEnd: number | undefined;

				for (const mapping of map.map.mappings) {
					const overlapRange = getOverlapRange(offsetRange.start, offsetRange.end, mapping.sourceRange[0], mapping.sourceRange[1]);
					if (overlapRange) {
						const start = map.map.toGeneratedOffset(overlapRange.start)?.[0];
						const end = map.map.toGeneratedOffset(overlapRange.end)?.[0];
						if (start !== undefined && end !== undefined) {
							minStart = minStart === undefined ? start : Math.min(start, minStart);
							maxEnd = maxEnd === undefined ? end : Math.max(end, maxEnd);
						}
					}
				}

				if (minStart !== undefined && maxEnd !== undefined) {
					return [{
						range: {
							start: map.virtualFileDocument.positionAt(minStart),
							end: map.virtualFileDocument.positionAt(maxEnd),
						},
						codeActionContext: _codeActionContext,
					}];
				}

				return [];
			},
			async (service, document, { range, codeActionContext }, map) => {

				if (token.isCancellationRequested)
					return;

				const serviceIndex = context.services.indexOf(service);
				const diagnostics = codeActionContext.diagnostics.filter(diagnostic => {
					const data: ServiceDiagnosticData | undefined = diagnostic.data;
					if (data && data.version !== sourceDocument.version) {
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

				const codeActions = await service.provideCodeActions?.(document, range, {
					...codeActionContext,
					diagnostics,
				}, token);

				codeActions?.forEach(codeAction => {
					codeAction.data = {
						uri,
						version: sourceDocument.version,
						original: {
							data: codeAction.data,
							edit: codeAction.edit,
						},
						serviceIndex: context.services.indexOf(service),
					} satisfies ServiceCodeActionData;
				});

				if (codeActions && map && service.transformCodeAction) {
					for (let i = 0; i < codeActions.length; i++) {
						const transformed = service.transformCodeAction(codeActions[i]);
						if (transformed) {
							codeActions[i] = transformed;
							transformedCodeActions.add(transformed);
						}
					}
				}

				return codeActions;
			},
			(actions, map) => actions.map(action => {

				if (transformedCodeActions.has(action))
					return action;

				if (!map)
					return action;

				if (action.edit) {
					const edit = embeddedEditToSourceEdit(
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
			}).filter(notEmpty),
			arr => dedupe.withCodeAction(arr.flat()),
		);
		const ruleActions: vscode.CodeAction[] = [];

		for (const diagnostic of codeActionContext.diagnostics) {
			const data: ServiceDiagnosticData | undefined = diagnostic.data;
			if (data && data.version !== sourceDocument.version) {
				// console.warn('[volar/rules-api] diagnostic version mismatch', data.version, sourceDocument.version);
				continue;
			}
		}

		return [
			...pluginActions ?? [],
			...ruleActions,
		];
	};
}
