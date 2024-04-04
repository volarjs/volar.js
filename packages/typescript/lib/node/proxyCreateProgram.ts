import type * as ts from 'typescript';
import { decorateProgram } from './decorateProgram';
import { Language, LanguagePlugin, createLanguage } from '@volar/language-core';
import { createResolveModuleName } from '../resolveModuleName';

let language: Language;

export function proxyCreateProgram(
	ts: typeof import('typescript'),
	original: typeof ts['createProgram'],
	getLanguagePlugins: (ts: typeof import('typescript'), options: ts.CreateProgramOptions) => LanguagePlugin[],
	getLanguageId: (fileName: string) => string,
) {
	return new Proxy(original, {
		apply: (target, thisArg, args) => {

			const options = args[0] as ts.CreateProgramOptions;
			assert(!!options.host, '!!options.host');

			const languagePlugins = getLanguagePlugins(ts, options);
			const extensions = languagePlugins
				.map(plugin => plugin.typescript?.extraFileExtensions.map(({ extension }) => `.${extension}`) ?? [])
				.flat();
			const sourceFileToSnapshotMap = new WeakMap<ts.SourceFile, ts.IScriptSnapshot>();
			language = createLanguage(
				languagePlugins,
				ts.sys.useCaseSensitiveFileNames,
				fileName => {
					let snapshot: ts.IScriptSnapshot | undefined;
					const sourceFile = originalHost.getSourceFile(fileName, 99 satisfies ts.ScriptTarget.ESNext);
					if (sourceFile) {
						snapshot = sourceFileToSnapshotMap.get(sourceFile);
						if (!snapshot) {
							snapshot = {
								getChangeRange() {
									return undefined;
								},
								getLength() {
									return sourceFile.text.length;
								},
								getText(start, end) {
									return sourceFile.text.substring(start, end);
								},
							};
							sourceFileToSnapshotMap.set(sourceFile, snapshot);
						}
					}
					if (snapshot) {
						language.scripts.set(fileName, getLanguageId(fileName), snapshot);
					}
					else {
						language.scripts.delete(fileName);
					}
				}
			);
			const parsedSourceFiles = new WeakMap<ts.SourceFile, ts.SourceFile>();
			const originalHost = options.host;

			options.host = { ...originalHost };
			options.host.getSourceFile = (
				fileName,
				languageVersionOrOptions,
				onError,
				shouldCreateNewSourceFile,
			) => {
				const originalSourceFile = originalHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
				if (originalSourceFile && extensions.some(ext => fileName.endsWith(ext))) {
					let sourceFile2 = parsedSourceFiles.get(originalSourceFile);
					if (!sourceFile2) {
						const sourceScript = language.scripts.get(fileName);
						assert(!!sourceScript, '!!sourceScript');
						let patchedText = originalSourceFile.text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
						let scriptKind = ts.ScriptKind.TS;
						if (sourceScript.generated?.languagePlugin.typescript) {
							const { getServiceScript, getExtraServiceScripts } = sourceScript.generated.languagePlugin.typescript;
							const serviceScript = getServiceScript(sourceScript.generated.root);
							if (serviceScript) {
								scriptKind = serviceScript.scriptKind;
								patchedText += serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
							}
							if (getExtraServiceScripts) {
								console.warn('getExtraServiceScripts() is not available in this use case.');
							}
						}
						sourceFile2 = ts.createSourceFile(
							fileName,
							patchedText,
							99 satisfies ts.ScriptTarget.ESNext,
							true,
							scriptKind,
						);
						// @ts-expect-error
						sourceFile2.version = originalSourceFile.version;
						parsedSourceFiles.set(originalSourceFile, sourceFile2);
					}
					return sourceFile2;
				}

				return originalSourceFile;
			};

			if (extensions.length) {
				options.options.allowArbitraryExtensions = true;

				const resolveModuleName = createResolveModuleName(ts, originalHost, language.plugins, fileName => language.scripts.get(fileName));
				const resolveModuleNameLiterals = originalHost.resolveModuleNameLiterals;
				const resolveModuleNames = originalHost.resolveModuleNames;
				const moduleResolutionCache = ts.createModuleResolutionCache(originalHost.getCurrentDirectory(), originalHost.getCanonicalFileName, options.options);

				options.host.resolveModuleNameLiterals = (
					moduleLiterals,
					containingFile,
					redirectedReference,
					compilerOptions,
					...rest
				) => {
					if (resolveModuleNameLiterals && moduleLiterals.every(name => !extensions.some(ext => name.text.endsWith(ext)))) {
						return resolveModuleNameLiterals(moduleLiterals, containingFile, redirectedReference, compilerOptions, ...rest);
					}
					return moduleLiterals.map(moduleLiteral => {
						return resolveModuleName(moduleLiteral.text, containingFile, compilerOptions, moduleResolutionCache, redirectedReference);
					});
				};
				options.host.resolveModuleNames = (
					moduleNames,
					containingFile,
					reusedNames,
					redirectedReference,
					compilerOptions,
					containingSourceFile
				) => {
					if (resolveModuleNames && moduleNames.every(name => !extensions.some(ext => name.endsWith(ext)))) {
						return resolveModuleNames(moduleNames, containingFile, reusedNames, redirectedReference, compilerOptions, containingSourceFile);
					}
					return moduleNames.map(moduleName => {
						return resolveModuleName(moduleName, containingFile, compilerOptions, moduleResolutionCache, redirectedReference).resolvedModule;
					});
				};
			}

			const program = Reflect.apply(target, thisArg, args) as ts.Program;

			decorateProgram(language, program);

			// TODO: #128
			(program as any).__volar__ = { language };

			return program;
		},
	});
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		console.error(message);
		throw new Error(message);
	}
}
