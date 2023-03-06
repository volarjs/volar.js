import { LanguageService } from '@volar/language-service';
import { editor as _editor, IDisposable, Position, Uri } from 'monaco-editor-core';
import { markers } from './utils/markers';
import * as protocol2monaco from './utils/protocol2monaco';
import * as monaco2protocol from './utils/monaco2protocol';

interface IInternalEditorModel extends _editor.IModel {
	onDidChangeAttached(listener: () => void): IDisposable;
	isAttachedToEditor(): boolean;
}

export namespace editor {

	export function activateMarkers(
		worker: _editor.MonacoWebWorker<LanguageService>,
		languages: string[],
		markersOwn: string,
		getSyncUris: () => Uri[],
		editor: typeof import('monaco-editor-core').editor,
	): IDisposable {

		const disposables: IDisposable[] = [];
		const listener = new Map<string, IDisposable>();

		disposables.push(
			editor.onDidCreateModel((model) => hostingMarkers(model)),
			editor.onWillDisposeModel(stopHostingMarkers),
			editor.onDidChangeModelLanguage((event) => {
				stopHostingMarkers(event.model);
				hostingMarkers(event.model);
			}),
			{
				dispose: () => {
					for (const model of editor.getModels()) {
						stopHostingMarkers(model);
					}
				}
			},
		);

		for (const model of editor.getModels()) {
			hostingMarkers(model);
		}

		return { dispose: () => disposables.forEach((d) => d.dispose()) };

		function stopHostingMarkers(model: _editor.IModel): void {
			editor.setModelMarkers(model, markersOwn, []);
			const key = model.uri.toString();
			if (listener.has(key)) {
				listener.get(key)?.dispose();
				listener.delete(key);
			}
		}

		function hostingMarkers(model: IInternalEditorModel): void {
			if (!languages.includes(model.getLanguageId())) {
				return;
			}

			let timer: NodeJS.Timeout | undefined;
			const changeSubscription = model.onDidChangeContent(() => {
				clearTimeout(timer);
				timer = setTimeout(() => doValidation(model), 200);
			});
			const visibleSubscription = model.onDidChangeAttached(() => {
				if (model.isAttachedToEditor()) {
					doValidation(model);
				} else {
					editor.setModelMarkers(model, markersOwn, []);
				}
			});

			listener.set(
				model.uri.toString(),
				{
					dispose: () => {
						changeSubscription.dispose();
						visibleSubscription.dispose();
						clearTimeout(timer);
					}
				},
			);

			doValidation(model);
		}

		async function doValidation(model: _editor.ITextModel) {
			if (model.isDisposed()) {
				return;
			}
			if (!model.isAttachedToEditor()) {
				return;
			}

			const version = model.getVersionId();
			const languageService = await worker.withSyncedResources(getSyncUris());
			const diagnostics = await languageService.doValidation(
				model.uri.toString(),
				'all',
			);
			if (model.getVersionId() !== version) {
				return;
			}
			const result = diagnostics.map(error => {
				const marker = protocol2monaco.asMarkerData(error);
				markers.set(marker, error);
				return marker;
			});

			editor.setModelMarkers(model, markersOwn, result);
		}
	}

	export function activateAutoInsertion(
		worker: _editor.MonacoWebWorker<LanguageService>,
		languages: string[],
		getSyncUris: () => Uri[],
		editor: typeof import('monaco-editor-core').editor,
	): IDisposable {

		const disposables: IDisposable[] = [];
		const listener = new Map<_editor.IModel, IDisposable>();

		let timeout: NodeJS.Timeout | undefined;

		disposables.push(
			editor.onDidCreateModel((model) => hostingAutoInsertion(model)),
			editor.onWillDisposeModel(stopHostingAutoInsertion),
			editor.onDidChangeModelLanguage((event) => {
				stopHostingAutoInsertion(event.model);
				hostingAutoInsertion(event.model);
			}),
			{
				dispose: () => {
					for (const disposable of listener.values()) {
						disposable.dispose();
					}
					listener.clear();
				}
			},
		);

		for (const model of editor.getModels()) {
			hostingAutoInsertion(model);
		}

		return { dispose: () => disposables.forEach((d) => d.dispose()) };

		function stopHostingAutoInsertion(model: _editor.IModel): void {
			if (listener.has(model)) {
				listener.get(model)?.dispose();
				listener.delete(model);
			}
		}

		function hostingAutoInsertion(model: IInternalEditorModel) {
			if (!languages.includes(model.getLanguageId())) {
				return;
			}
			listener.set(model, model.onDidChangeContent((e) => {
				if (model.isDisposed()) {
					return;
				}
				if (!model.isAttachedToEditor()) {
					return;
				}
				if (e.changes.length === 0 || e.isUndoing || e.isRedoing) {
					return;
				}
				const lastChange = e.changes[e.changes.length - 1];
				doAutoInsert(model, lastChange);
			}));
		}

		async function doAutoInsert(
			model: _editor.ITextModel,
			lastChange: _editor.IModelContentChange,
		) {
			if (timeout) {
				clearTimeout(timeout);
				timeout = undefined;
			}
			const version = model.getVersionId();
			timeout = setTimeout(() => {
				(async () => {
					if (model.getVersionId() !== version) {
						return;
					}
					const position = new Position(lastChange.range.startLineNumber, lastChange.range.startColumn + lastChange.text.length);
					const languageService = await worker.withSyncedResources(getSyncUris());
					const edit = await languageService.doAutoInsert(
						model.uri.toString(),
						monaco2protocol.asPosition(position),
						{
							lastChange: {
								range: monaco2protocol.asRange(lastChange.range),
								rangeLength: lastChange.rangeLength,
								text: lastChange.text,
								rangeOffset: lastChange.rangeOffset,
							},
						},
					);
					if (model.getVersionId() !== version) {
						return;
					}
					const codeEditor = editor.getEditors().find((e) => e.getModel() === model);
					if (codeEditor && edit && model.getVersionId() === version) {
						if (typeof edit === 'string') {
							(codeEditor?.getContribution('snippetController2') as any)?.insert(edit);
						}
						else {
							model.pushEditOperations([], [protocol2monaco.asTextEdit(edit)], () => []);
						}
					}
				})();
				timeout = undefined;
			}, 100);
		}
	}
}
