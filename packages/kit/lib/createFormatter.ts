import {
	createLanguage,
	createLanguageService,
	createUriMap,
	type FormattingOptions,
	type LanguagePlugin,
	type LanguageServicePlugin,
} from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createServiceEnvironment } from './createServiceEnvironment';

export function createFormatter(
	languages: LanguagePlugin<URI>[],
	services: LanguageServicePlugin[],
) {
	let settings = {};

	const fakeUri = URI.parse('file:///dummy.txt');
	const env = createServiceEnvironment(() => settings);
	const language = createLanguage(languages, createUriMap(false), () => {});
	const languageService = createLanguageService(language, services, env, {});

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
		language.scripts.set(fakeUri, snapshot, languageId);

		const document = languageService.context.documents.get(fakeUri, languageId, snapshot);
		const edits = await languageService.getDocumentFormattingEdits(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
