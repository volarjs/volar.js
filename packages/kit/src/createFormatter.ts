import { Config, FormattingOptions, TypeScriptLanguageHost, createLanguageService } from '@volar/language-service';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { asPosix, defaultCompilerOptions, fileNameToUri, fs, getConfiguration, uriToFileName } from './utils';

export function createFormatter(
	config: Config,
	compilerOptions = defaultCompilerOptions
) {

	const ts = require('typescript') as typeof import('typescript/lib/tsserverlibrary');

	let settings = {} as any;
	let dummyScriptUri = 'file:///dummy.txt';
	let fakeScriptVersion = 0;
	let fakeScriptFileName = '/dummy.txt';
	let fakeScriptSnapshot = ts.ScriptSnapshot.fromString('');
	let fakeScriptLanguageId: string | undefined;

	const service = createLanguageService(
		{ typescript: ts },
		{
			rootUri: URI.file('/'),
			uriToFileName: uri => {
				if (uri.startsWith(dummyScriptUri))
					return uri.replace(dummyScriptUri, fakeScriptFileName);
				return uriToFileName(uri);
			},
			fileNameToUri: fileName => {
				if (fileName.startsWith(fakeScriptFileName))
					return fileName.replace(fakeScriptFileName, dummyScriptUri);
				return fileNameToUri(fileName);
			},
			getConfiguration: section => getConfiguration(settings, section),
			fs,
		},
		config,
		createHost(),
	);

	return {
		formatFile,
		formatCode,
		get settings() {
			return settings;
		},
		set settings(newValue) {
			settings = newValue;
		},
	};

	async function formatFile(fileName: string, options: FormattingOptions): Promise<string> {
		fileName = asPosix(fileName);
		const uri = fileNameToUri(fileName);
		const document = service.context.getTextDocument(uri);
		if (!document) throw `file not found: ${fileName}`;
		const edits = await service.format(uri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}
		return document.getText();
	}

	async function formatCode(content: string, languageId: string, options: FormattingOptions): Promise<string> {
		fakeScriptSnapshot = ts.ScriptSnapshot.fromString(content);
		fakeScriptVersion++;
		fakeScriptLanguageId = languageId;
		const document = service.context.getTextDocument(dummyScriptUri)!;
		const edits = await service.format(dummyScriptUri, options, undefined, undefined);
		if (edits?.length) {
			const newString = TextDocument.applyEdits(document, edits);
			return newString;
		}
		return content;
	}

	function createHost() {
		let projectVersion = 0;
		const host: TypeScriptLanguageHost = {
			getCurrentDirectory: () => '/',
			getCompilationSettings: () => compilerOptions,
			getProjectVersion: () => projectVersion++,
			getScriptFileNames: () => fakeScriptSnapshot ? [fakeScriptFileName] : [],
			getScriptVersion: (fileName) => {
				if (fileName === fakeScriptFileName) {
					return fakeScriptVersion.toString();
				}
			},
			getScriptSnapshot: (fileName) => {
				if (fileName === fakeScriptFileName) {
					return fakeScriptSnapshot;
				}
			},
			getLanguageId: fileName => {
				if (fileName === fakeScriptFileName) {
					return fakeScriptLanguageId;
				}
			},
		};
		return host;
	}
}
