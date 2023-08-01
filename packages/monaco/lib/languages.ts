import type {
	editor,
	languages,
	IDisposable,
	MonacoEditor,
	Uri,
} from 'monaco-types';
import type { LanguageService } from '@volar/language-service';
import { createLanguageFeaturesProvider } from './utils/provider.js';
import { setMonaco } from 'monaco-languageserver-types';

export async function registerProviders(
	worker: editor.MonacoWebWorker<LanguageService>,
	language: languages.LanguageSelector,
	getSyncUris: () => Uri[],
	monaco: MonacoEditor
): Promise<IDisposable> {
	setMonaco(monaco);

	const { languages } = monaco;
	const provider = await createLanguageFeaturesProvider(worker, getSyncUris);
	const disposables: IDisposable[] = [
		languages.registerHoverProvider(language, provider),
		languages.registerReferenceProvider(language, provider),
		languages.registerRenameProvider(language, provider),
		languages.registerSignatureHelpProvider(language, provider),
		languages.registerDocumentSymbolProvider(language, provider),
		languages.registerDocumentHighlightProvider(language, provider),
		languages.registerLinkedEditingRangeProvider(language, provider),
		languages.registerDefinitionProvider(language, provider),
		languages.registerImplementationProvider(language, provider),
		languages.registerTypeDefinitionProvider(language, provider),
		languages.registerCodeLensProvider(language, provider),
		languages.registerCodeActionProvider(language, provider),
		languages.registerDocumentFormattingEditProvider(language, provider),
		languages.registerDocumentRangeFormattingEditProvider(language, provider),
		languages.registerOnTypeFormattingEditProvider(language, provider),
		languages.registerLinkProvider(language, provider),
		languages.registerCompletionItemProvider(language, provider),
		languages.registerColorProvider(language, provider),
		languages.registerFoldingRangeProvider(language, provider),
		languages.registerDeclarationProvider(language, provider),
		languages.registerSelectionRangeProvider(language, provider),
		languages.registerInlayHintsProvider(language, provider),
		languages.registerDocumentSemanticTokensProvider(language, provider),
		languages.registerDocumentRangeSemanticTokensProvider(language, provider),
	];

	return { dispose: () => disposables.forEach((d) => d.dispose()) };
}
