import { isSignatureHelpEnabled } from '@volar/language-core';
import type * as vscode from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';
import type { LanguageServiceContext, UriComponents } from '../types';
import { NoneCancellationToken } from '../utils/cancellation';
import { getGeneratedPositions, languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceContext) {

	return (
		_uri: URI | UriComponents,
		position: vscode.Position,
		signatureHelpContext: vscode.SignatureHelpContext = {
			triggerKind: 1 satisfies typeof vscode.SignatureHelpTriggerKind.Invoked,
			isRetrigger: false,
		},
		token = NoneCancellationToken
	) => {
		const uri = _uri instanceof URI ? _uri : URI.from(_uri);

		return languageFeatureWorker(
			context,
			uri,
			() => position,
			docs => getGeneratedPositions(docs, position, isSignatureHelpEnabled),
			(plugin, document, position) => {
				if (token.isCancellationRequested) {
					return;
				}
				if (
					signatureHelpContext?.triggerKind === 2 satisfies typeof vscode.SignatureHelpTriggerKind.TriggerCharacter
					&& signatureHelpContext.triggerCharacter
					&& !(
						signatureHelpContext.isRetrigger
							? plugin[0].capabilities.signatureHelpProvider?.retriggerCharacters
							: plugin[0].capabilities.signatureHelpProvider?.triggerCharacters
					)?.includes(signatureHelpContext.triggerCharacter)
				) {
					return;
				}
				return plugin[1].provideSignatureHelp?.(document, position, signatureHelpContext, token);
			},
			data => data
		);
	};
}
