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
import type { LanguageServiceEnvironment } from '@volar/language-service';
import { createSimpleWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
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

#### Add TypeScript Support

```diff
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import type { LanguageServiceEnvironment } from '@volar/language-service';
-import { createSimpleWorkerLanguageService } from '@volar/monaco/worker';
+import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';
+import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
+import ts from 'typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: LanguageServiceEnvironment = {
			workspaceFolders: [
				URI.parse('file:///'),
			],
		};
-		return createSimpleWorkerLanguageService({
+		return createTypeScriptWorkerLanguageService({
+			typescript: ts,
+			compilerOptions: {
+				// ...
+			},
+			uriConverter: {
+				asFileName: uri => uri.fsPath,
+				asUri: fileName => URI.file(fileName),
+			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			languageServicePlugins: [
				// ...
+				...createTypeScriptServicePlugin(ts),
			],
		});
	});
};
```

#### Add ATA Support for TypeScript

```diff
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import type { LanguageServiceEnvironment } from '@volar/language-service';
import { createTypeScriptWorkerLanguageService } from '@volar/monaco/worker';
import { URI } from 'vscode-uri';
+import { createNpmFileSystem } from '@volar/jsdelivr';
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';
import ts from 'typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: LanguageServiceEnvironment = {
			workspaceFolders: [
				URI.parse('file:///'),
			],
		};
+		env.fs = createNpmFileSystem();
		return createTypeScriptWorkerLanguageService({
			typescript: ts,
			compilerOptions: {
				// ...
			},
			uriConverter: {
				asFileName: uri => uri.fsPath,
				asUri: fileName => URI.file(fileName),
			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			languageServicePlugins: [
				// ...
				createTypeScriptServicePlugin(ts),
			],
		});
	});
};
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
import type { WorkerLanguageService } from '@volar/monaco/worker';
import { editor, languages, Uri } from 'monaco-editor-core';
import { activateMarkers, activateAutoInsertion, registerProviders } from '@volar/monaco';

languages.register({ id: 'my-lang', extensions: ['.my-lang'] });

languages.onLanguage('my-lang', () => {
	const worker = editor.createWebWorker<WorkerLanguageService>({
		moduleId: 'vs/language/my-lang/myLangWorker',
		label: 'my-lang',
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
