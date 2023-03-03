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
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import { createLanguageService } from '@volar/monaco/worker';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		return createLanguageService({
			workerContext: ctx,
			config: {
				// ...Language Service Config of my-lang language support
			},
		});
	});
};
```

#### TypeScript Support

```ts
import { createLanguageService, createDtsHost } from '@volar/monaco/worker';
import * as ts from 'typescript';

createLanguageService({
	// ...
	typescript: {
		module: ts as any,
		compilerOptions: {
			// ...tsconfig options
		},
	},
	// Enable auto fetch node_modules types
	dtsHost: createDtsHost('https://unpkg.com/', { typescript: '4.9.5' }),
});
```

### Add worker loader to global env

```ts
import editorWorker from 'monaco-editor-core/esm/vs/editor/editor.worker?worker';
import myWorker from './my-lang.worker?worker';

(self as any).MonacoEnvironment = {
	getWorker(_: any, label: string) {
		if (label === 'my-lang') {
			return new myWorker();
		}
		return new editorWorker();
	}
}
```

### Setup Language Features and Diagnostics

```ts
import type { LanguageService } from '@volar/language-service';
import { editor, languages, Uri } from 'monaco-editor-core';
import * as VolarMonaco from '@volar/monaco';

languages.register({ id: 'my-lang', extensions: ['.my-lang'] });

languages.onLanguage('my-lang', () => {
	const worker = editor.createWebWorker<LanguageService>({
		moduleId: 'vs/language/my-lang/myLangWorker',
		label: 'my-lang',
	});
	VolarMonaco.editor.activateMarkers(
		worker,
		['my-lang'],
		'my-lang-markers-owner',
		// sync files
		() => [Uri.file('/Foo.my-lang'), Uri.file('/Bar.my-lang')],
		editor
	);
	// auto close tags
	VolarMonaco.editor.activateAutoInsertion(
		worker,
		['my-lang'],
		// sync files
		() => [Uri.file('/Foo.my-lang'), Uri.file('/Bar.my-lang')],
		editor
	);
	VolarMonaco.languages.registerProvides(worker, ['my-lang'], languages)
});
```


## Samples

- Implementation for Vue:\
  https://github.com/Kingwl/monaco-volar
