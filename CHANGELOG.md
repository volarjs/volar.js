# Changelog

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
