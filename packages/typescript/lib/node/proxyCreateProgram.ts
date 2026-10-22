import { createLanguage, FileMap, type Language, type LanguagePlugin } from '@volar/language-core';
import type * as ts from 'typescript';
import { resolveFileLanguageId } from '../common';
import { createResolveModuleName } from '../resolveModuleName';
import { decorateProgram } from './decorateProgram';
import { fixupImpliedNodeFormatForFile } from './utils';

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

interface ProgramState {
	options: ts.CreateProgramOptions;
	languagePlugins: LanguagePlugin<string>[];
	language: Language<string>;
	moduleResolutionCache: ts.ModuleResolutionCache;
	fileSetVersion: number;
}

const projectStateReleasers = new WeakMap<object, (isActiveProject: (configFilePath: string) => boolean) => void>();

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

	// Keyed by the canonical `configFilePath`, so the projects of a solution builder
	// (`tsc -b`) don't evict each other's state; programs without one share a slot.
	const states = new Map<string | undefined, ProgramState>();
	// Bumped whenever a program's root files or options change. A kept module resolution
	// cache may hold lookups that a file added or removed since then invalidates, so the
	// other projects recreate theirs before they are built again.
	let fileSetVersion = 0;

	const proxy = new Proxy(original, {
		apply: (target, thisArg, args) => {
			const options = args[0] as ts.CreateProgramOptions;
			assert(!!options.host, '!!options.host');

			const configFilePath = options.options.configFilePath;
			const stateKey = typeof configFilePath === 'string'
				? options.host.getCanonicalFileName(configFilePath)
				: undefined;
			let state = states.get(stateKey);

			if (
				!state
				|| !arrayEqual(options.rootNames, state.options.rootNames)
				|| !objectEqual(options.options, state.options.options)
			) {
				if (state) {
					fileSetVersion++;
				}
				const moduleResolutionCache = createModuleResolutionCache(options.host, options.options);
				const created = create(ts, options);
				const languagePlugins = Array.isArray(created) ? created : created.languagePlugins;
				const language = createLanguage<string>(
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
							language.scripts.set(fileName, snapshot);
						}
						else {
							language.scripts.delete(fileName);
						}
					},
				);
				if ('setup' in created) {
					created.setup?.(language);
				}
				state = { options, languagePlugins, language, moduleResolutionCache, fileSetVersion };
				states.set(stateKey, state);
			}
			else if (state.fileSetVersion !== fileSetVersion) {
				state.moduleResolutionCache = createModuleResolutionCache(options.host, options.options);
				state.fileSetVersion = fileSetVersion;
			}

			const { languagePlugins, language, moduleResolutionCache } = state;
			const originalHost = options.host;
			const pluginExtensions = languagePlugins
				.map(plugin => plugin.typescript?.extraFileExtensions.map(({ extension }) => `.${extension}`) ?? [])
				.flat();

			// TypeScript prefers `getSourceFileByPath` over `getSourceFile` when reusing an old
			// program (e.g. `tsc --watch`), which would bypass the wrapper below.
			options.host = { ...originalHost, getSourceFileByPath: undefined };
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
					const sourceScript = language.scripts.get(fileName);
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
							// @ts-expect-error
							originalSourceFile.scriptKind = serviceScript.scriptKind;
							parsedSourceFiles.set(originalSourceFile, parsedSourceFile);
						}
						if (getExtraServiceScripts) {
							console.warn('getExtraServiceScripts() is not available in this use case.');
						}
					}
				}
				return parsedSourceFiles.get(originalSourceFile) ?? originalSourceFile;
			};

			if (pluginExtensions.length) {
				options.options.allowArbitraryExtensions = true;

				const resolveModuleName = createResolveModuleName(
					ts,
					ts.sys.getFileSize,
					originalHost,
					language.plugins,
					fileName => language.scripts.get(fileName),
				);
				const resolveModuleNameLiterals = originalHost.resolveModuleNameLiterals;
				const resolveModuleNames = originalHost.resolveModuleNames;
				// When any plugin opts in to `resolveHiddenExtensions`, the volar-aware
				// resolver above is what makes extensionless imports of plugin-extension
				// files resolvable (it answers `fileExists('Foo.d.ts')` as `true` when
				// `Foo.<ext>` is on disk). If the host already has a `resolveModuleNameLiterals`
				// — e.g. `tsc --watch` installs `resolutionCache.resolveModuleNameLiterals` —
				// the original fast-path delegates extensionless imports to it, bypassing
				// the wrapper and surfacing TS2307. Force the volar-aware resolver in
				// that case.
				const hasResolveHiddenExtensions = languagePlugins.some(
					plugin => plugin.typescript?.resolveHiddenExtensions,
				);

				options.host.resolveModuleNameLiterals = (
					moduleLiterals,
					containingFile,
					redirectedReference,
					compilerOptions,
					containingSourceFile,
					...rest
				) => {
					const disposeFixup = fixupImpliedNodeFormatForFile(
						ts,
						pluginExtensions,
						containingSourceFile,
						moduleResolutionCache.getPackageJsonInfoCache(),
						originalHost,
						compilerOptions,
					);
					try {
						if (
							resolveModuleNameLiterals
							&& !hasResolveHiddenExtensions
							&& moduleLiterals.every(name => !pluginExtensions.some(ext => name.text.endsWith(ext)))
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
					}
					finally {
						disposeFixup?.();
					}
				};
				options.host.resolveModuleNames = (
					moduleNames,
					containingFile,
					reusedNames,
					redirectedReference,
					compilerOptions,
					containingSourceFile,
				) => {
					if (
						resolveModuleNames
						&& !hasResolveHiddenExtensions
						&& moduleNames.every(name => !pluginExtensions.some(ext => name.endsWith(ext)))
					) {
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

	function createModuleResolutionCache(host: ts.CompilerHost, options: ts.CompilerOptions) {
		return ts.createModuleResolutionCache(host.getCurrentDirectory(), host.getCanonicalFileName, options);
	}

	projectStateReleasers.set(proxy, isActiveProject => {
		for (const key of states.keys()) {
			if (key !== undefined && !isActiveProject(key)) {
				states.delete(key);
			}
		}
	});

	return proxy;
}

/**
 * Drops the state kept for projects that the solution builder no longer builds.
 * `isActiveProject` receives the canonical path of a project's config file.
 */
export function releaseRemovedProjects(
	createProgram: object,
	isActiveProject: (configFilePath: string) => boolean,
) {
	projectStateReleasers.get(createProgram)?.(isActiveProject);
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		console.error(message);
		throw new Error(message);
	}
}
