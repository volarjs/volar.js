import { createLanguage, FileMap, type Language, type LanguagePlugin } from '@volar/language-core';
import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';
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
	create: (ts: typeof import('typescript'), options: ts.CreateProgramOptions) => LanguagePlugin<string>[] | {
		languagePlugins: LanguagePlugin<string>[];
		setup?(language: Language<string>): void;
	},
) {
	const sourceFileSnapshots = new FileMap<[ts.SourceFile | undefined, ts.IScriptSnapshot | undefined]>(
		ts.sys.useCaseSensitiveFileNames,
	);
	const parsedSourceFiles = new WeakMap<ts.SourceFile, ts.SourceFile | undefined>();

	let lastOptions: ts.CreateProgramOptions | undefined;
	let languagePlugins: LanguagePlugin<string>[] | undefined;
	let language: Language<string> | undefined;
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
				moduleResolutionCache = ts.createModuleResolutionCache(
					options.host.getCurrentDirectory(),
					options.host.getCanonicalFileName,
					options.options,
				);
				lastOptions = options;
				const created = create(ts, options);
				if (Array.isArray(created)) {
					languagePlugins = created;
				}
				else {
					languagePlugins = created.languagePlugins;
				}
				language = createLanguage<string>(
					[
						...languagePlugins,
						{ getLanguageId: resolveFileLanguageId },
					],
					new FileMap(ts.sys.useCaseSensitiveFileNames),
					(fileName, includeFsFiles) => {
						if (includeFsFiles && !sourceFileSnapshots.has(fileName)) {
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
							language!.scripts.set(fileName, snapshot);
						}
						else {
							language!.scripts.delete(fileName);
						}
					},
				);
				if ('setup' in created) {
					created.setup?.(language);
				}
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
				const originalSourceFile = originalHost.getSourceFile(
					fileName,
					languageVersionOrOptions,
					onError,
					shouldCreateNewSourceFile,
				);
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
					parsedSourceFiles.set(originalSourceFile, undefined);
					if (sourceScript.generated?.languagePlugin.typescript) {
						const { getServiceScript, getExtraServiceScripts } = sourceScript.generated.languagePlugin.typescript;
						const serviceScript = getServiceScript(sourceScript.generated.root);
						if (serviceScript) {
							let virtualContents: string;
							if (!serviceScript.preventLeadingOffset) {
								virtualContents = originalSourceFile.text.split('\n').map(line => ' '.repeat(line.length)).join('\n')
									+ serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
							}
							else {
								virtualContents = serviceScript.code.snapshot.getText(0, serviceScript.code.snapshot.getLength());
							}
							const parsedSourceFile = ts.createSourceFile(
								fileName,
								virtualContents,
								languageVersionOrOptions,
								undefined,
								serviceScript.scriptKind,
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
				return parsedSourceFiles.get(originalSourceFile) ?? originalSourceFile;
			};

			if (extensions.length) {
				options.options.allowArbitraryExtensions = true;

				const resolveModuleName = createResolveModuleName(
					ts,
					ts.sys.getFileSize,
					originalHost,
					language.plugins,
					fileName => language!.scripts.get(fileName),
				);
				const resolveModuleNameLiterals = originalHost.resolveModuleNameLiterals;
				const resolveModuleNames = originalHost.resolveModuleNames;

				options.host.resolveModuleNameLiterals = (
					moduleLiterals,
					containingFile,
					redirectedReference,
					compilerOptions,
					containingSourceFile,
					...rest
				) => {
					if (
						resolveModuleNameLiterals && moduleLiterals.every(name => !extensions.some(ext => name.text.endsWith(ext)))
					) {
						return resolveModuleNameLiterals(
							moduleLiterals,
							containingFile,
							redirectedReference,
							compilerOptions,
							containingSourceFile,
							...rest,
						);
					}
					return moduleLiterals.map(moduleLiteral => {
						const mode = ts.getModeForUsageLocation(containingSourceFile, moduleLiteral, compilerOptions);
						return resolveModuleName(
							moduleLiteral.text,
							containingFile,
							compilerOptions,
							moduleResolutionCache,
							redirectedReference,
							mode,
						);
					});
				};
				options.host.resolveModuleNames = (
					moduleNames,
					containingFile,
					reusedNames,
					redirectedReference,
					compilerOptions,
					containingSourceFile,
				) => {
					if (resolveModuleNames && moduleNames.every(name => !extensions.some(ext => name.endsWith(ext)))) {
						return resolveModuleNames(
							moduleNames,
							containingFile,
							reusedNames,
							redirectedReference,
							compilerOptions,
							containingSourceFile,
						);
					}
					return moduleNames.map(moduleName => {
						return resolveModuleName(
							moduleName,
							containingFile,
							compilerOptions,
							moduleResolutionCache,
							redirectedReference,
							containingSourceFile?.impliedNodeFormat,
						).resolvedModule;
					});
				};
			}

			const program = Reflect.apply(target, thisArg, args) as ts.Program;

			decorateProgram(language, program);

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
