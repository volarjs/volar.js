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
	type: 'service',
	original: Pick<vscode.CodeAction, 'data' | 'edit'>,
	serviceId: string,
}

export interface RuleCodeActionData {
	uri: string,
	version: number,
	documentUri: string,
	type: 'rule',
	isFormat: boolean,
	ruleId: string,
	ruleFixIndex: number,
	index: number,
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
			async (service, document, { range, codeActionContext }) => {

				if (token.isCancellationRequested)
					return;

				const serviceId = Object.keys(context.services).find(key => context.services[key] === service);
				const diagnostics = codeActionContext.diagnostics.filter(diagnostic => {
					const data: ServiceDiagnosticData | undefined = diagnostic.data;
					if (data && data.version !== sourceDocument.version) {
						return false;
					}
					return data?.type === 'service' && data?.serviceOrRuleId === serviceId;
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
						type: 'service',
						original: {
							data: codeAction.data,
							edit: codeAction.edit,
						},
						serviceId: Object.keys(context.services).find(key => context.services[key] === service)!,
					} satisfies ServiceCodeActionData;
				});

				return codeActions;
			},
			(actions, map) => actions.map(action => {

				if (!map)
					return action;

				if (action.edit) {
					const edit = embeddedEditToSourceEdit(
						action.edit,
						context.documents,
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
			if (data?.type === 'rule') {
				const fixes = context.ruleFixes?.[data.documentUri]?.[data.serviceOrRuleId]?.[data.ruleFixIndex];
				if (fixes) {
					for (let i = 0; i < fixes[1].length; i++) {
						const fix = fixes[1][i];
						const matchKinds: (string | undefined)[] = [];
						if (!codeActionContext.only) {
							matchKinds.push(undefined);
						}
						else {
							for (const kind of fix.kinds ?? ['quickfix']) {
								const matchOnly = matchOnlyKind(codeActionContext.only, kind);
								if (matchOnly) {
									matchKinds.push(matchOnly);
								}
							}
						}
						for (const matchKind of matchKinds) {
							const action: vscode.CodeAction = {
								title: fix.title ?? `Fix: ${diagnostic.message}`,
								kind: matchKind,
								diagnostics: [diagnostic],
								data: {
									uri,
									type: 'rule',
									version: data.version,
									isFormat: data.isFormat,
									ruleId: data.serviceOrRuleId,
									documentUri: data.documentUri,
									ruleFixIndex: data.ruleFixIndex,
									index: i,
								} satisfies RuleCodeActionData,
							};
							ruleActions.push(action);
						}
					}
				}
			}
		}

		return [
			...pluginActions ?? [],
			...ruleActions,
		];
	};
}

function matchOnlyKind(only: string[], kind: string) {
	const b = kind.split('.');
	for (const onlyKind of only) {
		const a = onlyKind.split('.');
		if (a.length <= b.length) {
			let matchNum = 0;
			for (let i = 0; i < a.length; i++) {
				if (a[i] == b[i]) {
					matchNum++;
				}
			}
			if (matchNum === a.length) {
				return onlyKind;
			}
		}
	}
}
