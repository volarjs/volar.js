import * as shared from '@volar/shared';
import * as transformer from '../transformer';
import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServiceRuntimeContext } from '../types';
import { getOverlapRange } from '../utils/common';
import * as dedupe from '../utils/dedupe';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { embeddedEditToSourceEdit } from './rename';
import { PluginDiagnosticData } from './validation';

export interface PluginCodeActionData {
	uri: string,
	type: 'plugin',
	original: Pick<vscode.CodeAction, 'data' | 'edit'>,
	pluginId: string,
}

export interface RuleCodeActionData {
	uri: string,
	documentUri: string,
	type: 'rule',
	ruleId: string,
	ruleFixIndex: number,
	index: number,
}

export function register(context: LanguageServiceRuntimeContext) {

	return async (uri: string, range: vscode.Range, codeActionContext: vscode.CodeActionContext) => {

		const document = context.getTextDocument(uri);
		if (!document)
			return;

		const offsetRange = {
			start: document.offsetAt(range.start),
			end: document.offsetAt(range.end),
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
						range: vscode.Range.create(
							map.virtualFileDocument.positionAt(minStart),
							map.virtualFileDocument.positionAt(maxEnd),
						),
						codeActionContext: _codeActionContext,
					}];
				}

				return [];
			},
			async (plugin, document, { range, codeActionContext }) => {

				const pluginId = Object.keys(context.plugins).find(key => context.plugins[key] === plugin);
				const diagnostics = codeActionContext.diagnostics.filter(diagnostic => {
					const data: PluginDiagnosticData | undefined = diagnostic.data;
					return data?.type === 'plugin' && data?.pluginOrRuleId === pluginId;
				}).map(diagnostic => {
					const data: PluginDiagnosticData = diagnostic.data;
					return {
						...diagnostic,
						...data.original,
					};
				});

				const codeActions = await plugin.codeAction?.on?.(document, range, {
					...codeActionContext,
					diagnostics,
				});

				codeActions?.forEach(codeAction => {
					codeAction.data = {
						uri,
						type: 'plugin',
						original: {
							data: codeAction.data,
							edit: codeAction.edit,
						},
						pluginId: Object.keys(context.plugins).find(key => context.plugins[key] === plugin)!,
					} satisfies PluginCodeActionData;
				});

				return codeActions;
			},
			(_codeActions, sourceMap) => _codeActions.map(_codeAction => {

				if (!sourceMap)
					return _codeAction;

				if (_codeAction.edit) {
					const edit = embeddedEditToSourceEdit(
						_codeAction.edit,
						context.documents,
					);
					if (edit) {
						_codeAction.edit = edit;
						return _codeAction;
					}
				}
				else {
					return _codeAction;
				}
			}).filter(shared.notEmpty),
			arr => dedupe.withCodeAction(arr.flat()),
		);
		const ruleActions: vscode.CodeAction[] = [];

		for (const diagnostic of codeActionContext.diagnostics) {
			const data: PluginDiagnosticData | undefined = diagnostic.data;
			if (data?.type === 'rule') {
				const fixes = context.ruleFixes?.[data.documentUri]?.[data.pluginOrRuleId]?.[data.ruleFixIndex];
				if (fixes) {
					for (let i = 0; i < fixes[1].length; i++) {
						const fix = fixes[1][i];
						const matchKinds: (string | undefined)[] = [];
						if (!codeActionContext.only) {
							matchKinds.push(undefined);
						}
						else {
							for (const kind of fix.kinds ?? ['quickfix', 'source.fixAll']) {
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
									ruleId: data.pluginOrRuleId,
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
