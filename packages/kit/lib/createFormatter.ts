import { FormattingOptions, LanguagePlugin, LanguageServicePlugin, createLanguage, createLanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';

export function createFormatter(
	languages: LanguagePlugin[],
	services: LanguageServicePlugin[]
) {

	let fakeUri = 'file:///dummy.txt';
	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const language = createLanguage(languages, false, () => { });
	const service = createLanguageService(
		language,
		services,
		env,
	);

	return {
		env,
		format,
		get settings() {
			return settings;
		},
		set settings(v) {
			settings = v;
		},
	};

	async function format(content: string, languageId: string, options: FormattingOptions): Promise<string> {

		const snapshot = ts.ScriptSnapshot.fromString(content);
		language.scripts.set(fakeUri, languageId, snapshot);

		const document = service.context.documents.get(fakeUri, languageId, snapshot);
		const edits = await service.format(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
