import { FileKind, VirtualFiles, forEachEmbeddedFile } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function decorateLanguageServiceHost(virtualFiles: VirtualFiles, languageServiceHost: ts.LanguageServiceHost, ts: typeof import('typescript/lib/tsserverlibrary'), exts: string[]) {

	let extraProjectVersion = 0;

	const scripts = new Map<string, {
		version: string;
		snapshot: ts.IScriptSnapshot | undefined;
		extension: string;
	}>();

	const resolveModuleNameLiterals = languageServiceHost.resolveModuleNameLiterals?.bind(languageServiceHost);
	const resolveModuleNames = languageServiceHost.resolveModuleNames?.bind(languageServiceHost);
	const getProjectVersion = languageServiceHost.getProjectVersion?.bind(languageServiceHost);
	const getScriptFileNames = languageServiceHost.getScriptFileNames.bind(languageServiceHost);
	const getScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);

	if (resolveModuleNameLiterals) {
		languageServiceHost.resolveModuleNameLiterals = (
			moduleNames,
			containingFile,
			redirectedReference,
			options,
			...rest
		) => {
			const resolvedModules = resolveModuleNameLiterals(
				moduleNames,
				containingFile,
				redirectedReference,
				options,
				...rest,
			);
			return moduleNames.map<ts.ResolvedModuleWithFailedLookupLocations>((name, i) => {
				if (exts.some(ext => name.text.endsWith(ext))) {
					return resolveModuleName(name.text, containingFile, options, redirectedReference);
				}
				return resolvedModules[i];
			});
		};
	}
	else if (resolveModuleNames) {
		languageServiceHost.resolveModuleNames = (
			moduleNames,
			containingFile,
			reusedNames,
			redirectedReference,
			options,
			containingSourceFile
		) => {
			const resolvedModules = resolveModuleNames(
				moduleNames,
				containingFile,
				reusedNames,
				redirectedReference,
				options,
				containingSourceFile,
			);
			return moduleNames.map<ts.ResolvedModule | undefined>((name, i) => {
				if (exts.some(ext => name.endsWith(ext))) {
					return resolveModuleName(name, containingFile, options, redirectedReference).resolvedModule;
				}
				return resolvedModules[i];
			});
		};
	}

	if (getProjectVersion) {
		languageServiceHost.getProjectVersion = () => {
			return getProjectVersion() + ':' + extraProjectVersion;
		};
	}

	languageServiceHost.getScriptFileNames = () => {
		if (languageServiceHost.getCompilationSettings().composite) {
			return [
				...getScriptFileNames(),
				...virtualFiles.allSources().map(source => source.fileName),
			];
		}
		else {
			return getScriptFileNames();
		}
	};

	languageServiceHost.getScriptSnapshot = (fileName) => {
		if (scripts.has(fileName)) {
			updateScript(fileName);
		}
		return scripts.get(fileName)?.snapshot ?? getScriptSnapshot(fileName);
	};

	function resolveModuleName(name: string, containingFile: string, options: ts.CompilerOptions, redirectedReference?: ts.ResolvedProjectReference) {
		const resolved = ts.resolveModuleName(name, containingFile, options, {
			readFile(fileName) {
				return languageServiceHost.readFile(fileName);
			},
			fileExists(fileName) {
				if (exts.some(ext => fileName.endsWith(ext + '.d.ts'))) {
					return languageServiceHost.fileExists(fileName.slice(0, -'.d.ts'.length));
				}
				return languageServiceHost.fileExists(fileName);
			},
		}, undefined, redirectedReference);
		if (resolved.resolvedModule) {
			resolved.resolvedModule.resolvedFileName = resolved.resolvedModule.resolvedFileName.slice(0, -'.d.ts'.length);
			const script = updateScript(resolved.resolvedModule.resolvedFileName);
			if (script) {
				resolved.resolvedModule.extension = script.extension;
			}
		}
		return resolved;
	}

	function updateScript(fileName: string) {

		const version = languageServiceHost.getScriptVersion(fileName);

		if (version !== scripts.get(fileName)?.version) {

			const text = languageServiceHost.readFile(fileName);

			let snapshot: ts.IScriptSnapshot | undefined;
			let extension = '.ts';

			if (text !== undefined) {
				extraProjectVersion++;
				const virtualFile = virtualFiles.updateSource(fileName, ts.ScriptSnapshot.fromString(text), undefined);
				if (virtualFile) {
					let patchedText = text.split('\n').map(line => ' '.repeat(line.length)).join('\n');
					forEachEmbeddedFile(virtualFile, file => {
						const ext = file.fileName.replace(fileName, '');
						if (file.kind === FileKind.TypeScriptHostFile && (ext === '.d.ts' || ext.match(/^\.(js|ts)x?$/))) {
							extension = ext;
							patchedText += file.snapshot.getText(0, file.snapshot.getLength());
						}
					});
					snapshot = ts.ScriptSnapshot.fromString(patchedText);
				}
			}
			else if (virtualFiles.hasSource(fileName)) {
				extraProjectVersion++;
				virtualFiles.deleteSource(fileName);
			}

			scripts.set(fileName, {
				version,
				snapshot,
				extension,
			});
		}

		return scripts.get(fileName);
	}
}
