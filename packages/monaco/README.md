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
import { createSimpleWorkerService, ServiceEnvironment } from '@volar/monaco/worker';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: ServiceEnvironment = {
			workspaceFolder: 'file:///',
		};
		return createSimpleWorkerService({
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			servicePlugins: [
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
-import { createSimpleWorkerService, ServiceEnvironment } from '@volar/monaco/worker';
+import {
+	createTypeScriptWorkerService,
+	ServiceEnvironment,
+} from '@volar/monaco/worker';
+import * as ts from 'typescript';
+import { create as createTypeScriptService } from 'volar-service-typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: ServiceEnvironment = {
			workspaceFolder: 'file:///',
+			typescript: {
+				uriToFileName: uri => uri.substring('file://'.length),
+				fileNameToUri: fileName => 'file://' + fileName,
+			},
		};
-		return createSimpleWorkerService({
+		return createTypeScriptWorkerService({
+			typescript: ts,
+			compilerOptions: {
+				// ...
+			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			servicePlugins: [
				// ...
+				createTypeScriptService(ts),
			],
		});
	});
};
```

#### Add ATA Support for TypeScript

```diff
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker';
import type * as monaco from 'monaco-editor-core';
import {
	createTypeScriptWorkerService,
	ServiceEnvironment,
+	activateAutomaticTypeAcquisition,
} from '@volar/monaco/worker';
import * as ts from 'typescript';
import { create as createTypeScriptService } from 'volar-service-typescript';

self.onmessage = () => {
	worker.initialize((ctx: monaco.worker.IWorkerContext) => {
		const env: ServiceEnvironment = {
			workspaceFolder: 'file:///',
			typescript: {
				uriToFileName: uri => uri.substring('file://'.length),
				fileNameToUri: fileName => 'file://' + fileName,
			},
		};
+		activateAutomaticTypeAcquisition(env);
		return createTypeScriptWorkerService({
			typescript: ts,
			compilerOptions: {
				// ...
			},
			workerContext: ctx,
			env,
			languagePlugins: [
				// ...
			],
			servicePlugins: [
				// ...
				createTypeScriptService(ts),
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
import type { LanguageService } from '@volar/language-service';
import { editor, languages, Uri } from 'monaco-editor-core';
import { activateMarkers, activateAutoInsertion, registerProviders } from '@volar/monaco';

languages.register({ id: 'my-lang', extensions: ['.my-lang'] });

languages.onLanguage('my-lang', () => {
	const worker = editor.createWebWorker<LanguageService>({
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
	registerProviders(worker, ['my-lang'], languages)
});
```


## Samples

- Implementation for Vue:\
  https://github.com/Kingwl/monaco-volar
