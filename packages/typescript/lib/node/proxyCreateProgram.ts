import type * as ts from 'typescript';
import { decorateProgram } from './decorateProgram';
import { LanguagePlugin, createFileRegistry, resolveCommonLanguageId } from '@volar/language-core';

export function proxyCreateProgram(
	ts: typeof import('typescript'),
	original: typeof ts['createProgram'],
	extensions: string[],
	getLanguagePlugins: (ts: typeof import('typescript'), options: ts.CreateProgramOptions) => LanguagePlugin[],
) {
	return new Proxy(original, {
		apply: (target, thisArg, args) => {

			const options = args[0] as ts.CreateProgramOptions;
			assert(!!options.host, '!!options.host');

			const sourceFileToSnapshotMap = new WeakMap<ts.SourceFile, ts.IScriptSnapshot>();
			const files = createFileRegistry(
				getLanguagePlugins(ts, options),
				ts.sys.useCaseSensitiveFileNames,
				fileName => {
					let snapshot: ts.IScriptSnapshot | undefined;
					assert(originalSourceFiles.has(fileName), `originalSourceFiles.has(${fileName})`);
					const sourceFile = originalSourceFiles.get(fileName);
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
						files.set(fileName, resolveCommonLanguageId(fileName), snapshot);
					}
					else {
						files.delete(fileName);
					}
				}
			);
			const originalSourceFiles = new Map<string, ts.SourceFile | undefined>();
			const parsedSourceFiles = new WeakMap<ts.SourceFile, ts.SourceFile>();
			const arbitraryExtensions = extensions.map(ext => `.d${ext}.ts`);
			const originalHost = options.host;
			const moduleResolutionHost: ts.ModuleResolutionHost = {
				...originalHost,
				fileExists(fileName) {
					for (let i = 0; i < arbitraryExtensions.length; i++) {
						if (fileName.endsWith(arbitraryExtensions[i])) {
							return originalHost.fileExists(fileName.slice(0, -arbitraryExtensions[i].length) + extensions[i]);
						}
					}
					return originalHost.fileExists(fileName);
				},
			};

			options.host = { ...originalHost };
			options.options.allowArbitraryExtensions = true;
			options.host.getSourceFile = (
				fileName,
				languageVersionOrOptions,
				onError,
				shouldCreateNewSourceFile,
			) => {

				const originalSourceFile = originalHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreateNewSourceFile);

				originalSourceFiles.set(fileName, originalSourceFile);

				if (originalSourceFile && extensions.some(ext => fileName.endsWith(ext))) {
					let sourceFile2 = parsedSourceFiles.get(originalSourceFile);
					if (!sourceFile2) {
						const sourceFile = files.get(fileName);
						assert(!!sourceFile, '!!sourceFile');
						let patchedText = originalSourceFile.text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
						let scriptKind = ts.ScriptKind.TS;
						if (sourceFile.generated?.languagePlugin.typescript) {
							const { getScript, getExtraScripts } = sourceFile.generated.languagePlugin.typescript;
							const script = getScript(sourceFile.generated.code);
							if (script) {
								scriptKind = script.scriptKind;
								patchedText += script.code.snapshot.getText(0, script.code.snapshot.getLength());
							}
							if (getExtraScripts) {
								console.warn('getExtraScripts() is not available in this use case.');
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
			options.host.resolveModuleNameLiterals = (
				moduleNames,
				containingFile,
				redirectedReference,
				options,
			) => {
				return moduleNames.map<ts.ResolvedModuleWithFailedLookupLocations>(name => {
					return resolveModuleName(name.text, containingFile, options, redirectedReference);
				});
			};
			options.host.resolveModuleNames = (
				moduleNames,
				containingFile,
				_reusedNames,
				redirectedReference,
				options,
			) => {
				return moduleNames.map<ts.ResolvedModule | undefined>(name => {
					return resolveModuleName(name, containingFile, options, redirectedReference).resolvedModule;
				});
			};

			const program = Reflect.apply(target, thisArg, [options]) as ts.Program;

			decorateProgram(files, program);

			(program as any).__volar__ = { files };

			return program;

			function resolveModuleName(name: string, containingFile: string, options: ts.CompilerOptions, redirectedReference: ts.ResolvedProjectReference | undefined) {
				const resolved = ts.resolveModuleName(
					name,
					containingFile,
					options,
					moduleResolutionHost,
					originalHost.getModuleResolutionCache?.(),
					redirectedReference
				);
				if (resolved.resolvedModule) {
					for (let i = 0; i < arbitraryExtensions.length; i++) {
						if (resolved.resolvedModule.resolvedFileName.endsWith(arbitraryExtensions[i])) {
							const sourceFileName = resolved.resolvedModule.resolvedFileName.slice(0, -arbitraryExtensions[i].length) + extensions[i];
							resolved.resolvedModule.resolvedFileName = sourceFileName;
							resolved.resolvedModule.extension = extensions[i];
						}
					}
				}
				return resolved;
			}
		},
	});
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		console.error(message);
		throw new Error(message);
	}
}
