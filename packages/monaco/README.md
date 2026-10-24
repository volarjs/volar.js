# @volar/monaco

`@volar/monaco` is used to bridge the language capabilities implemented based on Volar.js to Monaco Editor, you can expect:

- Support IntelliSense, Diagnosis, Formatting
- Language behavior is consistent with regular IDEs
- Optimized Performance
- Missing package types are automatically fetched from CDN

It should be noted that this package does not participate in syntax highlighting support and language configuration.

We assume you already know:

- How to create a Monaco Editor
- How to work with Web Worker

## Usage

### Setup worker

```ts
// my-lang.worker.ts
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker.start';
import type * as monaco from 'monaco-editor-core';
import type { LanguageServiceEnvironment } from '@volar/language-service';
import { createSimpleWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';

self.onmessage = () => {
	worker.start((ctx: monaco.worker.IWorkerContext) => {
		const env: LanguageServiceEnvironment = {
			workspaceFolders: [
				URI.parse('file:///'),
			],
		};
		return createSimpleWorkerLanguageService({
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			languageServicePlugins: [
				// ...
			],
		});
	});
};
```

`monaco-editor-core` does not ship type declarations for `editor.worker.start`, so declare the module yourself (e.g. in `env.d.ts`):

```ts
declare module 'monaco-editor-core/esm/vs/editor/editor.worker.start' {
	import type { worker } from 'monaco-editor-core';

	export function start<THost extends object, TClient extends object>(
		createClient: (ctx: worker.IWorkerContext<THost>) => TClient,
	): TClient;
}
```

If you use `monaco-editor` instead, import `start` from `monaco-editor/editor/editor.worker.start` and declare that module (with `worker` imported from `monaco-editor`).

### Add worker loader to global env

```ts
import editorWorker from 'monaco-editor-core/esm/vs/editor/common/services/editorWebWorkerMain?worker';

(self as any).MonacoEnvironment = {
	getWorker() {
		return new editorWorker();
	}
}
```

### Setup Language Features and Diagnostics

```ts
import type { WorkerLanguageService } from '@volar/monaco/worker';
import { editor, languages, Uri } from 'monaco-editor-core';
import { activateMarkers, activateAutoInsertion, registerProviders } from '@volar/monaco';
import myWorker from './my-lang.worker?worker';

languages.register({ id: 'my-lang', extensions: ['.my-lang'] });

languages.onLanguage('my-lang', () => {
	const worker = editor.createWebWorker<WorkerLanguageService>({
		worker: new myWorker(),
	});
	activateMarkers(
		worker,
		['my-lang'],
		'my-lang-markers-owner',
		// sync files
		() => [Uri.file('/Foo.my-lang'), Uri.file('/Bar.my-lang')],
		editor
	);
	// auto close tags
	activateAutoInsertion(
		worker,
		['my-lang'],
		// sync files
		() => [Uri.file('/Foo.my-lang'), Uri.file('/Bar.my-lang')],
		editor
	);
	registerProviders(
		worker,
		['my-lang'],
		// sync files
		() => [Uri.file('/Foo.my-lang'), Uri.file('/Bar.my-lang')],
		languages
	)
});
```


## Samples

- Implementation for Vue:\
  https://github.com/Kingwl/monaco-volar
