import type * as vscode from 'vscode-languageserver-protocol';
import type { ServiceContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';
import { NoneCancellationToken } from '../utils/cancellation';

export function register(context: ServiceContext) {

	return (
		uri: string,
		position: vscode.Position,
		signatureHelpContext: vscode.SignatureHelpContext = {
			triggerKind: 1 satisfies typeof vscode.SignatureHelpTriggerKind.Invoked,
			isRetrigger: false,
		},
		token = NoneCancellationToken,
	) => {

		return languageFeatureWorker(
			context,
			uri,
			position,
			(position, map) => map.toGeneratedPositions(position, data => !!data.completion),
			(service, document, position) => {
				if (token.isCancellationRequested)
					return;
				if (
					signatureHelpContext?.triggerKind === 2 satisfies typeof vscode.SignatureHelpTriggerKind.TriggerCharacter
					&& signatureHelpContext.triggerCharacter
					&& !(
						signatureHelpContext.isRetrigger
							? service.signatureHelpRetriggerCharacters
							: service.signatureHelpTriggerCharacters
					)?.includes(signatureHelpContext.triggerCharacter)
				) {
					return;
				}
				return service.provideSignatureHelp?.(document, position, signatureHelpContext!, token);
			},
			(data) => data,
		);
	};
}
