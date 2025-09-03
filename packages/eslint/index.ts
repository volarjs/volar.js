import {
	createLanguage,
	FileMap,
	forEachEmbeddedCode,
	isDiagnosticsEnabled,
	type LanguagePlugin,
	type SourceScript,
	type VirtualCode,
} from '@volar/language-core';
import type { Linter } from 'eslint';
import { TextDocument } from 'vscode-languageserver-textdocument';

const windowsPath = /\\/g;

export function createProcessor(
	languagePlugins: LanguagePlugin<string>[],
	caseSensitive: boolean,
	extensionsMap: Record<string, string> = {
		'javascript': '.js',
		'typescript': '.ts',
		'javascriptreact': '.jsx',
		'typescriptreact': '.tsx',
		'css': '.css',
		'less': '.less',
		'scss': '.scss',
		'sass': '.sass',
		'postcss': '.pcss',
		'stylus': '.styl',
		'html': '.html',
		'pug': '.pug',
		'json': '.json',
		'jsonc': '.json',
		'yaml': '.yaml',
		'markdown': '.md',
	},
	supportsAutofix = true,
): Linter.Processor {
	const language = createLanguage<string>(languagePlugins, new FileMap(caseSensitive), () => {});
	const documents = new FileMap<{
		sourceScript: SourceScript<string>;
		sourceDocument: TextDocument;
		embeddedDocuments: TextDocument[];
		codes: VirtualCode[];
	}>(caseSensitive);
	return {
		supportsAutofix,
		preprocess(text, filename) {
			filename = filename.replace(windowsPath, '/');
			const files: Linter.ProcessorFile[] = [];
			const sourceScript = language.scripts.set(filename, {
				getLength() {
					return text.length;
				},
				getText(start, end) {
					return text.substring(start, end);
				},
				getChangeRange() {
					return undefined;
				},
			});
			if (sourceScript?.generated) {
				const codes = [];
				const embeddedDocuments = [];
				for (const code of forEachEmbeddedCode(sourceScript.generated.root)) {
					if (code.mappings.some(mapping => isDiagnosticsEnabled(mapping.data))) {
						const ext = extensionsMap[code.languageId];
						if (!ext) {
							continue;
						}
						files.push({
							filename: filename + ext,
							text: code.snapshot.getText(0, code.snapshot.getLength()),
						});
						codes.push(code);
						embeddedDocuments.push(
							TextDocument.create(
								filename + ext,
								code.languageId,
								0,
								code.snapshot.getText(0, code.snapshot.getLength()),
							),
						);
					}
				}
				documents.set(filename, {
					sourceScript,
					sourceDocument: TextDocument.create(filename, sourceScript.languageId, 0, text),
					embeddedDocuments,
					codes,
				});
			}
			return files;
		},
		postprocess(messagesArr, filename) {
			filename = filename.replace(windowsPath, '/');
			const docs = documents.get(filename);
			if (docs) {
				const { sourceScript, codes, sourceDocument, embeddedDocuments } = docs;
				for (let i = 0; i < messagesArr.length; i++) {
					const code = codes[i];
					const map = language.maps.get(code, sourceScript);
					if (!map) {
						messagesArr[i].length = 0;
						continue;
					}
					const embeddedDocument = embeddedDocuments[i];
					messagesArr[i] = messagesArr[i].filter(message => {
						const start = embeddedDocument.offsetAt({ line: message.line - 1, character: message.column - 1 });
						const end = embeddedDocument.offsetAt({
							line: (message.endLine ?? message.line) - 1,
							character: (message.endColumn ?? message.column) - 1,
						});
						for (const [sourceStart, mapping] of map.toSourceLocation(start)) {
							if (isDiagnosticsEnabled(mapping.data)) {
								for (const [sourceEnd, mapping] of map.toSourceLocation(end)) {
									if (isDiagnosticsEnabled(mapping.data)) {
										const sourcePosition = sourceDocument.positionAt(sourceStart);
										const sourceEndPosition = sourceDocument.positionAt(sourceEnd);
										message.line = sourcePosition.line + 1;
										message.column = sourcePosition.character + 1;
										message.endLine = sourceEndPosition.line + 1;
										message.endColumn = sourceEndPosition.character + 1;
										return true;
									}
								}
								break;
							}
						}
						return false;
					});
				}
				return messagesArr.flat();
			}
			return [];
		},
	};
}
