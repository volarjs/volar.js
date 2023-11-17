import { FormattingOptions, Language, Service, createFileProvider, createLanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createServiceEnvironment } from './createServiceEnvironment';

export function createFormatter(
	languages: Language[],
	services: Service[]
) {

	let fakeUri = 'file:///dummy.txt';
	let fakeFileName = '/dummy.txt';
	let settings = {};

	const env = createServiceEnvironment(() => settings);
	const fileProvider = createFileProvider(languages, () => { });
	const service = createLanguageService(
		{ typescript: ts as any },
		services,
		env,
		{ fileProvider },
	);

	return {
		// apis
		format,

		// settings
		get settings() {
			return settings;
		},
		set settings(v) {
			settings = v;
		},
	};

	async function format(content: string, languageId: string, options: FormattingOptions): Promise<string> {

		fileProvider.updateSource(fakeFileName, ts.ScriptSnapshot.fromString(content), languageId);

		const document = service.context.getTextDocument(fakeUri)!;
		const edits = await service.format(fakeUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}

		return content;
	}
}
