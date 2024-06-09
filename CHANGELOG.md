# Changelog

## [2.3.0](https://github.com/volarjs/volar.js/compare/v2.2.5...v2.3.0) (2024-06-09)

### Features

- **language-core:** added option to resolve hidden extensions ([#190](https://github.com/volarjs/volar.js/issues/190))
- **language-core:** reimplemented multi-source mapping ([#194](https://github.com/volarjs/volar.js/issues/194))
- **language-core:** completed support for multi-source mapping in plugin mode ([#197](https://github.com/volarjs/volar.js/issues/197)) - Thanks @piotrtomiak
- **language-server:** added support for Workspace Diagnostics ([#199](https://github.com/volarjs/volar.js/issues/199))
- **language-server:** accurately defined language server capabilities ([#185](https://github.com/volarjs/volar.js/issues/185))
- **typescript:** added option to prevent offset in plugin mode ([#191](https://github.com/volarjs/volar.js/issues/191))

### Bug Fixes

- **language-service:** fixed conversion of markdown links
- **vscode:** showed error on missing TypeScript lib ([#195](https://github.com/volarjs/volar.js/issues/195)) - Thanks @msujew
- **monaco:** fixed Monaco selection ranges conversion ([#198](https://github.com/volarjs/volar.js/issues/198)) - Thanks @remcohaszing

### Performance

- **vscode:** auto insertion request now exits early on vscode ([#157](https://github.com/volarjs/volar.js/issues/157))
- **language-server:** improved snapshot reusability ([#196](https://github.com/volarjs/volar.js/issues/196))
- **typescript:** skips `searchExternalFiles` if extra extensions are empty

### Refactors

- **typescript:** added `setup` option for `createLanguageServicePlugin`, `createAsyncLanguageServicePlugin`
- **language-core:** `LanguagePlugin` now requires the first generic parameter to specify the script ID type
- **language-core:** `updateVirtualCode` is now optional, if not provided, `createVirtualCode` is always called to update source script
- **language-server:** `createTypeScriptProjectProvider` has been renamed to `createTypeScriptProject`
- **language-server:** `createSimpleProjectProvider` has been renamed to `createSimpleProject`
- **language-server:** no longer handles `@vscode/l10n`
- **language-server:** removed `InitializationOptions` interface
- **language-service:** LSP related logic has been changed to be completely based on URI ([#182](https://github.com/volarjs/volar.js/issues/182))
- **language-service:** `LanguageServiceEnvironment#workapceFolder` is now a URI array and has been renamed to `workspaceFolders`
- **language-service:** `provideAutoInsertionEdit` has been renamed to `provideAutoInsertSnippet`
- **language-service:** normalized `LanguageService` API name format
- **labs:** Codegen Stacks debug feature has been removed (#184)

## [2.2.5](https://github.com/volarjs/volar.js/compare/v2.2.4...v2.2.5) (2024-05-23)

### Features

- **source-map:** add API to support generated code with different length than original code [#183](https://github.com/volarjs/volar.js/issues/183) - Thanks @piotrtomiak

## [2.2.4](https://github.com/volarjs/volar.js/compare/v2.2.3...v2.2.4) (2024-05-15)

### Bug Fixes

- **typescript:** path completion not working for meta files

## [2.2.3](https://github.com/volarjs/volar.js/compare/v2.2.2...v2.2.3) (2024-05-15)

### Bug Fixes

- **typescript:** empty items list should be valid completion result [vuejs/language-tools#4368](https://github.com/vuejs/language-tools/issues/4368)
- **typescript:** deduplication when merging hover infos [#178](https://github.com/volarjs/volar.js/issues/178)
- **language-service:** transforming volar embedded URIs in markdown [#180](https://github.com/volarjs/volar.js/issues/180) - Thanks @remcohaszing
- **language-server:** memorize URI conversion results of synchronized documents [#181](https://github.com/volarjs/volar.js/issues/181)

## [2.2.2](https://github.com/volarjs/volar.js/compare/v2.2.1...v2.2.2) (2024-05-10)

### Bug Fixes

- **typescript:** TS plugin only displays the first hover info
- **language-core:** `isRenameEnabled` respect `CodeInformation.navigation.shouldRename`
- **test-utils:** use stdio transport for test server [#175](https://github.com/volarjs/volar.js/issues/175)

## [2.2.1](https://github.com/volarjs/volar.js/compare/v2.2.0...v2.2.1) (2024-05-06)

### Features

- **language-server:** restored support for "Reload Project" command

### Bug Fixes

- **typescript:** additional completion not working in TS plugin [vuejs/language-tools#4323](https://github.com/vuejs/language-tools/issues/4323)
- **language-server:** pass correct languageId when creating virtual code [#173](https://github.com/volarjs/volar.js/issues/173)

## [2.2.0](https://github.com/volarjs/volar.js/compare/v2.1.6...v2.2.0) (2024-05-01)

### Features

- Add ESLint integration [#171](https://github.com/volarjs/volar.js/issues/171)
- **language-service:** auto insertion does not abstract selection [#156](https://github.com/volarjs/volar.js/issues/156)

### Bug Fixes

- **typescript:** `runTsc` cannot display source code for errors [vuejs/language-tools#4099](https://github.com/vuejs/language-tools/issues/4099)
- **typescript:** `runTsc` cannot display source code for errors with `--incremental` [#158](https://github.com/volarjs/volar.js/issues/158) [#162](https://github.com/volarjs/volar.js/issues/162) - Thanks @wangshunnn
- **typescript:** handle invalid references result
- **typescript:** parameter hints not working in TS plugin [vuejs/language-tools#3948](https://github.com/vuejs/language-tools/issues/3948)
- **typescript:** fault tolerance with TS file size assertion [vuejs/language-tools#4278](https://github.com/vuejs/language-tools/issues/4278)
- **typescript:** TS plugin find reference result's definition span should be able to fall back to file root
- **typescript:** prioritize resolving JS virtual script to matched `.d.ts` file
- **typescript:** more inclusive performance rename operation [vuejs/language-tools#4297](https://github.com/vuejs/language-tools/issues/4297)
- **typescript:** normalize filePath for language service APIs [vuejs/language-tools#4297](https://github.com/vuejs/language-tools/issues/4297)
- **typescript:** avoid eagerly updating source scripts [#166](https://github.com/volarjs/volar.js/issues/166)
- **vscode:** newly created file failed to match tsconfig immediately [vuejs/language-tools#4297](https://github.com/vuejs/language-tools/issues/4297)
- **vscode:** avoid crash when workspace tsdk does not exist
- **language-server:** fault-tolerant URI translation [#159](https://github.com/volarjs/volar.js/issues/159)
- **language-core:** handle empty mappings in updateVirtualCodeMapOfMap [#161](https://github.com/volarjs/volar.js/issues/161) - Thanks @remcohaszing

### Performance

- **typescript:** fix `runTsc` performance regression since 2.0 [vuejs/language-tools#4238](https://github.com/vuejs/language-tools/issues/4238)
- **typescript:** `runTsc` cache module resolution result [vuejs/language-tools#4177](https://github.com/vuejs/language-tools/issues/4177)

### Refactors

- More accurate interface design and terminology [#154](https://github.com/volarjs/volar.js/issues/154)
- **language-server:** architecture improvements [#167](https://github.com/volarjs/volar.js/issues/167)
- **language-server:** remove `ConfigurationHost` abstract
- **language-service:** expose changed setting sections on `onDidChangeConfiguration`
- **language-service:** `ServiceContext.inject` method return nullable
- **typescript:** `decorateLanguageServiceHost` less side effects [#160](https://github.com/volarjs/volar.js/issues/160)
- **language-core:** make `CodeInformation` properties optional
- **language-core:** resolved language ID by LangaugePlugin [#168](https://github.com/volarjs/volar.js/issues/168)

## [2.1.6](https://github.com/volarjs/volar.js/compare/v2.1.5...v2.1.6) (2024-03-28)

### Bug Fixes

- **typescript:** ts plugin cannot generate embedded code for .ts files
- **typescript:** handle mapping for formatting APIs in plugin [vuejs/language-tools#4066](https://github.com/vuejs/language-tools/issues/4066)
- **typescript:** handle mapping for file rename API in plugin [vuejs/language-tools#3646](https://github.com/vuejs/language-tools/issues/3646)
- **typescript:** semantic tokens range param does not mapped correctly [vuejs/language-tools#3934](https://github.com/vuejs/language-tools/issues/3934) [vuejs/language-tools#3935](https://github.com/vuejs/language-tools/issues/3935)

## [2.1.5](https://github.com/volarjs/volar.js/compare/v2.1.4...v2.1.5) (2024-03-23)

### Bug Fixes

- **language-server:** `GetVirtualCodeRequest` incorrectly responses empty vritual code if no mappings
- **typescript:** mark the parent directory as exists when created a file

## [2.1.4](https://github.com/volarjs/volar.js/compare/v2.1.3...v2.1.4) (2024-03-22)

### Features

- **test-utils:** add 3 APIs: `updateTextDocument`, `updateConfiguration`, `didChangeWatchedFiles`

### Bug Fixes

- **typescript:** sys cache is not updated correctly in case sensitive file system [#153](https://github.com/volarjs/volar.js/issues/153)
- **typescript:** create a new file did not update sys cache (https://github.com/withastro/language-tools/issues/685)

## [2.1.3](https://github.com/volarjs/volar.js/compare/v2.1.2...v2.1.3) (2024-03-20)

### Bug Fixes

- **typescript:** fix emit signature to enable incremental work to function properly [#150](https://github.com/volarjs/volar.js/issues/150) - thanks @skywalker512
- **language-server:** also consider deletions for getRootFiles [#152](https://github.com/volarjs/volar.js/issues/152) - thanks @Princesseuh

### Other Changes

- **language-service:** add name for `SemanticToken` tuple members
- **vscode:** migrate from `StatusBarItem` to `LanguageStatusItem`

## [2.1.2](https://github.com/volarjs/volar.js/compare/v2.1.1...v2.1.2) (2024-03-07)

### Bug Fixes

- **typescript:** reverted [f041c79](https://github.com/volarjs/volar.js/commit/f041c79df5e3ea95c8ba78d1616405dfa9c25135) as it caused severe performance regressions [vuejs/language-tools#4024](https://github.com/vuejs/language-tools/issues/4024)

## [2.1.1](https://github.com/volarjs/volar.js/compare/v2.1.0...v2.1.1) (2024-03-05)

### Bug Fixes

- **test-utils:** allow unknown initialization options and expose `locale` option [#142](https://github.com/volarjs/volar.js/issues/142)
- **typescript:** virtual file update condition should be based generated snapshot rather than source script version
- **monaco:** correct package name resolve on ATA [#149](https://github.com/volarjs/volar.js/issues/149)
- **language-service:** provideCodeActions's range param is not accurately mapped
- **language-service:** provideInlayHints's range param is not accurately mapped

### Refactors

- Webpack compatibility [#144](https://github.com/volarjs/volar.js/issues/144)
- **language-service:** add provide generic to ServicePlugin type [#143](https://github.com/volarjs/volar.js/issues/143)

## [2.1.0](https://github.com/volarjs/volar.js/compare/v2.0.4...v2.1.0) (2024-02-26)

### Features

- **language-service**: more reliable embedded code formatting [#138](https://github.com/volarjs/volar.js/issues/138)
	- Embedded code indentation is no longer handled by `@volar/language-service`, but instead calculated and passed as `initialIndentLevel`, which is then reliably handled by ServicePlugin for additional indentation in specific languages.
	- The `provideDocumentFormattingEdits` and `provideOnTypeFormattingEdits` APIs now accept the `EmbeddedCodeFormattingOptions` parameter, which includes `initialIndentLevel`.
	- Formatting ranges are now correctly mapped to embedded code formatting ranges.
	- Removed the no longer needed `ServicePlugin.provideFormattingIndentSensitiveLines` API.
	- No longer relies on the conventional `volar.format.initialIndent` editor setting.
	- Added `ServicePlugin.resolveEmbeddedCodeFormattingOptions` API, allowing downstream tools to modify the `initialIndentLevel` passed to ServicePlugin based on custom settings (replacing `volar.format.initialIndent`).

### Refactors

- **test-utils:** server tester support `ClientCapabilities` param for `initialize()` API
- **test-utils:** server tester expose `sendDocumentRangeFormattingRequestRequest()` and `shutdown()` API
- **language-core:** make embeddedCodes optional in VirtualCode [#137](https://github.com/volarjs/volar.js/issues/137)
- **language-server:** SemanticTokens requests are no longer delayed by 200ms
- **language-server:** APIs updates [#140](https://github.com/volarjs/volar.js/issues/140)
	- `createSimpleProjectProvider` has been renamed to `createSimpleProjectProviderFactory` and needs to be invoked with no arguments.
	- `createTypeScriptProjectProvider` has been renamed to `createTypeScriptProjectProviderFactory` and needs to be invoked with a TS module as an argument.
	- Deprecate `typescript#tsdk`, `typescript#tsdkUrl`, `ignoreTriggerCharacters` initialization options.
	- Deprecate `fullCompletionList` initialization option. [#139](https://github.com/volarjs/volar.js/issues/139)
	- Remove experimental `provideDiagnosticMarkupContent` API.

### Bug Fixes

- **language-server:** language features not working for untitled documents [#135](https://github.com/volarjs/volar.js/issues/135)
- **language-server:** `pushDiagnostics` should not be notified when closing a file if server push diagnostics are not enabled
- **language-service** `provideSelectionRanges` API multiple result merging method is inconsistent with VSCode
- **language-service** `provideDocumentSemanticTokens` API's `range` param is not mapped to virtual code
- **language-service** `provideDocumentFormattingEdits` API's `range` param is not accurately mapped to virtual code [#136](https://github.com/volarjs/volar.js/issues/136)
- **language-service** fix caching of semantic diagnostics  [#141](https://github.com/volarjs/volar.js/issues/141)
- **test-utils:** invalidate cache when calling `openInMemoryDocument()`
- **monaco:** `insertText` and `range` properties of completion item not converted correctly
- **typescript:**: ts plugin incorrectly resolve module name

## [2.0.4](https://github.com/volarjs/volar.js/compare/v2.0.3...v2.0.4) (2024-02-13)

### Features

- **ci:** integrate with https://github.com/volarjs/ecosystem-ci

### Bug Fixes

- **language-service:** transform markdown links in completion items [#133](https://github.com/volarjs/volar.js/issues/133)
- **typescript:** typescript plugin module resolve behavior inconsistent with language server
- **typescript:** typescript plugin breaks semantic highlighting for .ts files (https://github.com/withastro/language-tools/issues/788)

## [2.0.3](https://github.com/volarjs/volar.js/compare/v2.0.2...v2.0.3) (2024-02-10)

### Features

- **labs:** recognize Glint and other file extensions via reading installed extensions language configuration
- **labs:** improve mapping decorations display

### Bug Fixes

- **labs:** extension keeps sending requests when output panel is opened
- **language-service:** transform markdown links for hover content (https://github.com/mdx-js/mdx-analyzer/issues/394)
- **typescript:** unable to resolve import path based on package export (https://github.com/withastro/language-tools/issues/778)

## [2.0.2](https://github.com/volarjs/volar.js/compare/v2.0.1...v2.0.2) (2024-02-08)

### Bug Fixes

- **labs:** extension not working with framework version 2.0.0
- **typescript:** remove runtime dependency on `@volar/language-service`
- **typescript:** additional completion not working in ts plugin
- **typescript:** remove warning when `allowNonTsExtensions` is not set

## [2.0.1](https://github.com/volarjs/volar.js/compare/v2.0.0...v2.0.1) (2024-02-05)

### Features

- **typescript:** expose `FileRegistry` in `proxyCreateProgram()` [#128](https://github.com/volarjs/volar.js/issues/128)
- **typescript:** re-support extra virtual scripts for LSP and Kit [#132](https://github.com/volarjs/volar.js/issues/132)

### Bug Fixes

- **vscode:** update `currentLabsVersion` to `2`
- **typescript:** remove mistakenly published scripts `lib/quickstart/create(Async)TSServerPlugin`, please use `lib/quickstart/create(Async)LanguageServicePlugin` instead of

## [2.0.0](https://github.com/volarjs/volar.js/compare/v1.11.1...v2.0.0) (2024-01-21)

Please refer to [#85](https://github.com/volarjs/volar.js/issues/85) for details.
