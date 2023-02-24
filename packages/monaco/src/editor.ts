import type { LanguageService } from '@volar/language-service';
import type { editor as _editor, IDisposable, Uri } from 'monaco-editor-core';
import { markers } from './utils/markers';
import * as protocol2monaco from './utils/protocol2monaco';

interface IInternalEditorModel extends _editor.IModel {
	onDidChangeAttached(listener: () => void): IDisposable;
	isAttachedToEditor(): boolean;
}

export namespace editor {

	export function activateMarkers(
		worker: _editor.MonacoWebWorker<LanguageService>,
		languages: string[],
		markersOwn: string,
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

			const languageService = await getLanguageService(model.uri);
			const diagnostics = await languageService.doValidation(model.uri.toString());
			const result = diagnostics.map(error => {
				const marker = protocol2monaco.asMarkerData(error);
				markers.set(marker, error);
				return marker;
			});

			editor.setModelMarkers(model, markersOwn, result);
		}

		async function getLanguageService(...uris: Uri[]) {
			await worker.withSyncedResources(uris);
			return worker.getProxy();
		}
	}
}
