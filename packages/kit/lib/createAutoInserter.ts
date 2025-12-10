import {
	createLanguage,
	createLanguageService,
	createUriMap,
	type LanguagePlugin,
	type LanguageServicePlugin,
} from '@volar/language-service';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { createServiceEnvironment } from './createServiceEnvironment';

export function createAutoInserter(
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
		autoInsert,
		get settings() {
			return settings;
		},
		set settings(v) {
			settings = v;
		},
	};

	async function autoInsert(textWithCursor: string, insertedText: string, languageId: string, cursor = '|') {
		const cursorIndex = textWithCursor.indexOf(cursor);
		if (cursorIndex === -1) {
			throw new Error('Cursor marker not found in input text.');
		}
		const content = textWithCursor.slice(0, cursorIndex) + insertedText
			+ textWithCursor.slice(cursorIndex + cursor.length);
		const snapshot = ts.ScriptSnapshot.fromString(content);
		language.scripts.set(fakeUri, snapshot, languageId);
		const document = languageService.context.documents.get(fakeUri, languageId, snapshot);
		return await languageService.getAutoInsertSnippet(
			fakeUri,
			document.positionAt(cursorIndex + insertedText.length),
			{
				rangeOffset: cursorIndex,
				rangeLength: 0,
				text: insertedText,
			},
		);
	}
}
