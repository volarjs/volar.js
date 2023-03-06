import * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServicePluginContext) {

	return (
		uri: string,
		position: vscode.Position,
		signatureHelpContext: vscode.SignatureHelpContext = {
			triggerKind: vscode.SignatureHelpTriggerKind.Invoked,
			isRetrigger: false,
		},
		token = vscode.CancellationToken.None,
	) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.completion),
			(plugin, document, position) => {
				if (token.isCancellationRequested)
					return;
				if (
					signatureHelpContext?.triggerKind === vscode.SignatureHelpTriggerKind.TriggerCharacter
					&& signatureHelpContext.triggerCharacter
					&& !(
						signatureHelpContext.isRetrigger
							? plugin.signatureHelpRetriggerCharacters
							: plugin.signatureHelpTriggerCharacters
					)?.includes(signatureHelpContext.triggerCharacter)
				) {
					return;
				}
				return plugin.provideSignatureHelp?.(document, position, signatureHelpContext!, token);
			},
			(data) => data,
		);
	};
}
