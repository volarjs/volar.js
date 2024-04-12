import { Language, LanguagePlugin, createLanguage } from '@volar/language-core';
import type * as ts from 'typescript';
import { createResolveModuleName } from '../resolveModuleName';
import { decorateProgram } from './decorateProgram';

const arrayEqual = (a: readonly any[], b: readonly any[]) => {
	if (a.length !== b.length) {
		return false;
	}
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return false;
		}
	}
	return true;
};
const objectEqual = (a: any, b: any) => {
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) {
		return false;
	}
	for (const key of keysA) {
		if (a[key] !== b[key]) {
			return false;
		}
	}
	return true;
};

export function proxyCreateProgram(
	ts: typeof import('typescript'),
	original: typeof ts['createProgram'],
	getLanguagePlugins: (ts: typeof import('typescript'), options: ts.CreateProgramOptions) => LanguagePlugin[],
	getLanguageId: (fileName: string) => string,
) {
	const sourceFileSnapshots = new Map<string, [ts.SourceFile | undefined, ts.IScriptSnapshot | undefined]>();
	const parsedSourceFiles = new WeakMap<ts.SourceFile, ts.SourceFile>();

	let lastOptions: ts.CreateProgramOptions | undefined;
	let languagePlugins: LanguagePlugin[] | undefined;
	let language: Language | undefined;
	let moduleResolutionCache: ts.ModuleResolutionCache;

	return new Proxy(original, {
		apply: (target, thisArg, args) => {

			const options = args[0] as ts.CreateProgramOptions;
			assert(!!options.host, '!!options.host');

			if (
				!lastOptions
				|| !languagePlugins
				|| !language
				|| !arrayEqual(options.rootNames, lastOptions.rootNames)
				|| !objectEqual(options.options, lastOptions.options)
			) {
				moduleResolutionCache = ts.createModuleResolutionCache(options.host.getCurrentDirectory(), options.host.getCanonicalFileName, options.options);
				lastOptions = options;
				languagePlugins = getLanguagePlugins(ts, options);
				language = createLanguage(
					languagePlugins,
					ts.sys.useCaseSensitiveFileNames,
					fileName => {
						if (!sourceFileSnapshots.has(fileName)) {
							const sourceFileText = originalHost.readFile(fileName);
							if (sourceFileText !== undefined) {
								sourceFileSnapshots.set(fileName, [undefined, {
									getChangeRange() {
										return undefined;
									},
									getLength() {
										return sourceFileText.length;
									},
									getText(start, end) {
										return sourceFileText.substring(start, end);
									},
								}]);
							}
							else {
								sourceFileSnapshots.set(fileName, [undefined, undefined]);
							}
						}
						const snapshot = sourceFileSnapshots.get(fileName)?.[1];
						if (snapshot) {
							language!.scripts.set(fileName, getLanguageId(fileName), snapshot);
						}
						else {
							language!.scripts.delete(fileName);
						}
					}
				);
			}

			const originalHost = options.host;
			const extensions = languagePlugins
				.map(plugin => plugin.typescript?.extraFileExtensions.map(({ extension }) => `.${extension}`) ?? [])
				.flat();

			options.host = { ...originalHost };
			options.host.getSourceFile = (
				fileName,
				languageVersionOrOptions,
				onError,
				shouldCreateNewSourceFile,
			) => {
				const originalSourceFile = originalHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);
				if (
					!sourceFileSnapshots.has(fileName)
					|| sourceFileSnapshots.get(fileName)?.[0] !== originalSourceFile
				) {
					if (originalSourceFile) {
						sourceFileSnapshots.set(fileName, [originalSourceFile, {
							getChangeRange() {
								return undefined;
							},
							getLength() {
								return originalSourceFile.text.length;
							},
							getText(start, end) {
								return originalSourceFile.text.substring(start, end);
							},
						}]);
					}
					else {
						sourceFileSnapshots.set(fileName, [undefined, undefined]);
					}
				}
				if (!originalSourceFile) {
					return;
				}
				if (!parsedSourceFiles.has(originalSourceFile)) {
					const sourceScript = language!.scripts.get(fileName);
					assert(!!sourceScript, '!!sourceScript');
					parsedSourceFiles.set(originalSourceFile, originalSourceFile);
					if (sourceScript.generated?.languagePlugin.typescript) {
						const { getServiceScript, getExtraServiceScripts } = sourceScript.generated.languagePlugin.typescript;
						const serviceScript = getServiceScript(sourceScript.generated.root);
						if (serviceScript) {
							let patchedText = originalSourceFile.text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
							let scriptKind = ts.ScriptKind.TS;
							scriptKind = serviceScript.scriptKind;
							patchedText += serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
							const parsedSourceFile = ts.createSourceFile(
								fileName,
								patchedText,
								languageVersionOrOptions,
								undefined,
								scriptKind,
							);
							// @ts-expect-error
							parsedSourceFile.version = originalSourceFile.version;
							parsedSourceFiles.set(originalSourceFile, parsedSourceFile);
						}
						if (getExtraServiceScripts) {
							console.warn('getExtraServiceScripts() is not available in this use case.');
						}
					}
				}
				return parsedSourceFiles.get(originalSourceFile);
			};

			if (extensions.length) {
				options.options.allowArbitraryExtensions = true;

				const resolveModuleName = createResolveModuleName(ts, originalHost, language.plugins, fileName => language!.scripts.get(fileName));
				const resolveModuleNameLiterals = originalHost.resolveModuleNameLiterals;
				const resolveModuleNames = originalHost.resolveModuleNames;

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
