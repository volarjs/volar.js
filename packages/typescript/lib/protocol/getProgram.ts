import type { FileProvider } from '@volar/language-core';
import type * as ts from 'typescript/lib/tsserverlibrary';

export function getProgram(
	ts: typeof import('typescript/lib/tsserverlibrary'),
	fileProvider: FileProvider,
	{ fileNameToId, idToFileName }: {
		fileNameToId(fileName: string): string;
		idToFileName(id: string): string;
	},
	ls: ts.LanguageService,
	sys: ts.System,
): ts.Program {

	const proxy: Partial<ts.Program> = {
		getRootFileNames,
		emit,
		getSyntacticDiagnostics,
		getSemanticDiagnostics,
		getGlobalDiagnostics,
		// @ts-expect-error
		getBindAndCheckDiagnostics,
	};

	return new Proxy({}, {
		get: (target: any, property: keyof ts.Program) => {
			if (property in proxy) {
				return proxy[property];
			}
			const program = getProgram();
			if (property in program) {
				return program[property];
			}
			return target[property];
		},
		// #17
		// notice: https://github.com/vuejs/language-tools/issues/2403
		set: (target, property, newValue) => {
			const program = getProgram() as any;
			target[property] = program[property] = newValue;
			return true;
		},
	});

	function getProgram() {
		return ls.getProgram()!;
	}

	function getRootFileNames() {
		return getProgram().getRootFileNames().filter(fileName => sys.fileExists?.(fileName));
	}

	// for vue-tsc --noEmit --watch
	function getBindAndCheckDiagnostics(sourceFile?: ts.SourceFile, cancellationToken?: ts.CancellationToken) {
		return getSourceFileDiagnosticsWorker(sourceFile, cancellationToken, 'getBindAndCheckDiagnostics' as 'getSemanticDiagnostics');
	}

	// for vue-tsc --noEmit
	function getSyntacticDiagnostics(sourceFile?: ts.SourceFile, cancellationToken?: ts.CancellationToken) {
		return getSourceFileDiagnosticsWorker(sourceFile, cancellationToken, 'getSyntacticDiagnostics');
	}
	function getSemanticDiagnostics(sourceFile?: ts.SourceFile, cancellationToken?: ts.CancellationToken) {
		return getSourceFileDiagnosticsWorker(sourceFile, cancellationToken, 'getSemanticDiagnostics');
	}

	function getSourceFileDiagnosticsWorker<T extends 'getSyntacticDiagnostics' | 'getSemanticDiagnostics'>(
		sourceFile: ts.SourceFile | undefined,
		cancellationToken: ts.CancellationToken | undefined,
		api: T,
	): ReturnType<ts.Program[T]> {

		if (sourceFile) {

			const uri = fileNameToId(sourceFile.fileName);
			const [virtualFile, source] = fileProvider.getVirtualFile(uri);

			if (virtualFile && source) {

				if (!virtualFile.capabilities.diagnostic)
					return [] as any;

				const errors = transformDiagnostics(ls.getProgram()?.[api](sourceFile, cancellationToken) ?? []);

				return errors as any;
			}
		}

		return transformDiagnostics(getProgram()[api](sourceFile, cancellationToken) ?? []) as any;
	}

	function getGlobalDiagnostics(cancellationToken?: ts.CancellationToken): readonly ts.Diagnostic[] {
		return transformDiagnostics(getProgram().getGlobalDiagnostics(cancellationToken) ?? []);
	}
	function emit(targetSourceFile?: ts.SourceFile, _writeFile?: ts.WriteFileCallback, cancellationToken?: ts.CancellationToken, emitOnlyDtsFiles?: boolean, customTransformers?: ts.CustomTransformers): ts.EmitResult {
		const scriptResult = getProgram().emit(targetSourceFile, (sys.writeFile ?? ts.sys.writeFile), cancellationToken, emitOnlyDtsFiles, customTransformers);
		return {
			emitSkipped: scriptResult.emitSkipped,
			emittedFiles: scriptResult.emittedFiles,
			diagnostics: transformDiagnostics(scriptResult.diagnostics),
		};
	}

	// transform
	function transformDiagnostics<T extends ts.Diagnostic | ts.DiagnosticWithLocation | ts.DiagnosticRelatedInformation>(diagnostics: readonly T[]): T[] {
		const result: T[] = [];

		for (const diagnostic of diagnostics) {
			if (
				diagnostic.file !== undefined
				&& diagnostic.start !== undefined
				&& diagnostic.length !== undefined
			) {

				const uri = fileNameToId(diagnostic.file.fileName);
				const [virtualFile, source] = fileProvider.getVirtualFile(uri);

				if (virtualFile && source) {

					const sourceFileName = idToFileName(source.id);

					if (sys.fileExists?.(sourceFileName) === false)
						continue;

					for (const [_, [sourceSnapshot, map]] of fileProvider.getMaps(virtualFile)) {

						if (sourceSnapshot !== source.snapshot)
							continue;

						for (const start of map.toSourceOffsets(diagnostic.start)) {

							const reportStart = typeof start[1].data.diagnostic === 'object' ? start[1].data.diagnostic.shouldReport() : !!start[1].data.diagnostic;
							if (!reportStart)
								continue;

							for (const end of map.toSourceOffsets(diagnostic.start + diagnostic.length, true)) {

								const reportEnd = typeof end[1].data.diagnostic === 'object' ? end[1].data.diagnostic.shouldReport() : !!end[1].data.diagnostic;
								if (!reportEnd)
									continue;

								onMapping(diagnostic, sourceFileName, start[0], end[0], source.snapshot.getText(0, source.snapshot.getLength()));
								break;
							}
							break;
						}
					}
				}
				else {

					if (sys.fileExists?.(diagnostic.file.fileName) === false)
						continue;

					onMapping(diagnostic, diagnostic.file.fileName, diagnostic.start, diagnostic.start + diagnostic.length, diagnostic.file.text);
				}
			}
			else if (diagnostic.file === undefined) {
				result.push(diagnostic);
			}
		}

		return result;

		function onMapping(diagnostic: T, fileName: string, start: number, end: number, docText: string | undefined) {

			let file = fileName === diagnostic.file?.fileName
				? diagnostic.file
				: undefined;
			if (!file) {

				if (docText === undefined) {
					const uri = fileNameToId(fileName);
					const snapshot = fileProvider.getSourceFile(uri)?.snapshot;
					if (snapshot) {
						docText = snapshot.getText(0, snapshot.getLength());
					}
				}
				else {
					file = ts.createSourceFile(fileName, docText, ts.ScriptTarget.Latest, undefined, ts.ScriptKind.Deferred);

					// fix https://github.com/vuejs/language-tools/issues/2622 for TS 5.0
					(file as any).originalFileName = fileName;
					(file as any).path = fileName.toLowerCase();
					(file as any).resolvedPath = fileName.toLowerCase();
				}
			}
			const newDiagnostic: T = {
				...diagnostic,
				file,
				start: start,
				length: end - start,
			};
			const relatedInformation = (diagnostic as ts.Diagnostic).relatedInformation;
			if (relatedInformation) {
				(newDiagnostic as ts.Diagnostic).relatedInformation = transformDiagnostics(relatedInformation);
			}

			result.push(newDiagnostic);
		}
	}
}
