import type * as vscode from 'vscode-languageserver-protocol';
import type { LanguageServicePluginContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServicePluginContext) {

	return (uri: string, position: vscode.Position, signatureHelpContext?: vscode.SignatureHelpContext) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.completion),
			(plugin, document, position) => plugin.getSignatureHelp?.(document, position, signatureHelpContext),
			(data) => data,
		);
	};
}
