# Changelog

## [2.4.13](https://github.com/volarjs/volar.js/compare/v2.4.12...v2.4.13) (2025-04-26)

### Bug Fixes

- fix(labs): add document selector check for language clients in virtualFilesView
- fix(labs): add document selector check for language clients in servicePluginsView
- fix(typescript): fix issue when mapping ranges are exactly the same as ranges passed to getFixesAtPosition and getFormattingEditsForRange (#270) - Thanks to @piotrtomiak!
- fix(typescript): robust calculation of generated span for semantic classifications (#271) - Thanks to @KazariEX

### Other Changes

- chore: fix years in changelog (#268) - Thanks to @tomblachut

## [2.4.12](https://github.com/volarjs/volar.js/compare/v2.4.11...v2.4.12) (2025-03-07)

### Bug Fixes

- fix(language-core): trigger targets dirty when associatedOnly is true
- fix(typescript): force update target file version on association dirty (#267)
- fix(jsdelivr): make params.`getPackageVersion` useful (#266) - Thanks to @wangcch!

### Other Changes

- docs(monaco): update documentation to match the current API status (#255) - Thanks to @elchininet!
- docs(typescript): clean up and document `createLanguageServicePlugin` and `createAsyncLanguageServicePlugin` (#261) - Thanks to @machty!

## [2.4.11](https://github.com/volarjs/volar.js/compare/v2.4.10...v2.4.11) (2024-12-14)

### Features

- feat(typescript): add typescriptObject option to runTsc (#245) - Thanks to @zhiyuanzmj!

### Bug Fixes

- fix(typescript): should not suppressing getLanguageId crashes (#253)
- fix(typescript): force update the opened script snapshot after the language plugin is ready (#254)
- fix(typescript): fix issue with transpiled TypeScript files not being registered with a project at all (#250) - Thanks to @piotrtomiak!
- fix(typescript): resolve the shim used for tsc in Typescript v5.7 and up (#252) - Thanks to @kitsune7!

### Other Changes

- docs(source-map): updated API section based on #207 (#248) - Thanks to @alamhubb!

## [2.4.10](https://github.com/volarjs/volar.js/compare/v2.4.9...v2.4.10) (2024-11-08)

### Bug Fixes

- **typescript:** fix interactive refactors ([#244](https://github.com/volarjs/volar.js/issues/244)) - Thanks to @andrewbranch!

## [2.4.9](https://github.com/volarjs/volar.js/compare/v2.4.8...v2.4.9) (2024-11-07)

### Bug Fixes

- **typescript:** avoid crash when converting relatedInformation from overly large files

## [2.4.8](https://github.com/volarjs/volar.js/compare/v2.4.7...v2.4.8) (2024-10-26)

### Bug Fixes

- **typescript:** content-sensitive features are only allowed to return results in contiguous mapped ranges ([#243](https://github.com/volarjs/volar.js/issues/243))

## [2.4.7](https://github.com/volarjs/volar.js/compare/v2.4.6...v2.4.7) (2024-10-25)

### Bug Fixes

- **typescript:** set module resolution cache ([#242](https://github.com/volarjs/volar.js/issues/242)) - Thanks to @Princesseuh!

## [2.4.6](https://github.com/volarjs/volar.js/compare/v2.4.5...v2.4.6) (2024-10-07)

### Bug Fixes

- **language-server:** correctly calculate coalesced document change ([#240](https://github.com/volarjs/volar.js/issues/240)) - Thanks to @rchl!

## [2.4.5](https://github.com/volarjs/volar.js/compare/v2.4.4...v2.4.5) (2024-09-14)

### Bug Fixes

- **typescript:** avoid duplicate completion items in plugin mode

### Refactors

- **typescript:** deprecated resolveLanguageServiceHost
- **kit:** add setup hook for create checker functions

## [2.4.4](https://github.com/volarjs/volar.js/compare/v2.4.3...v2.4.4) (2024-09-08)

### Bug Fixes

- **monaco:** requests always cancel

## [2.4.3](https://github.com/volarjs/volar.js/compare/v2.4.2...v2.4.3) (2024-09-08)

### Bug Fixes

- **language-server:** handle completion item snippet unsupported ([withastro/language-tools#948](https://github.com/withastro/language-tools/issues/948))
- **monaco:** getDiagnostics throws "TypeError: response is not a function"

### Refactors

- **language-server:** improve error handling for unsupported capabilities

## [2.4.2](https://github.com/volarjs/volar.js/compare/v2.4.1...v2.4.2) (2024-09-04)

### Bug Fixes

- **language-server:** prepare language service for synchronized documents
- **typescript:** fix inlay hints mapping for large chunks of source code mapped verbatim to generated code (#236) - Thanks to @piotrtomiak!

## [2.4.1](https://github.com/volarjs/volar.js/compare/v2.4.0...v2.4.1) (2024-08-29)

### Features

- **language-server:** support files that do not exist in FS but are open in the editor for TS project ([#235](https://github.com/volarjs/volar.js/issues/235))

### Bug Fixes

- **typescript:** ensure unopened files are synced to project ([vuejs/language-tools#4711](https://github.com/vuejs/language-tools/issues/4711)) ([vuejs/language-tools#4632](https://github.com/vuejs/language-tools/issues/4632)) - Thanks to @davidmatter!
- **language-server:** avoid project initialized twice
- **language-service:** don't set item data if item has been resolved
- **language-service:** don't set item data if LanguageServicePlugin does not provide resolve hook ([#233](https://github.com/volarjs/volar.js/issues/233))
- **test-utils:** correct `openUntitledDocument` params order
- **typescript:** `runTsc` does not recognize service script with `preventLeadingOffset` enabled
- **language-server:** replace `setTimeout` with `setImmediate` ([#234](https://github.com/volarjs/volar.js/issues/234)) - Thanks to @nieyuyao!

### Refactors

- **language-server:** add `onDidChange` API for `LanguageServer.workspaceFolders`
- **language-core:** add `error`, `source` params for `verification.shouldReport` hook

## [2.4.0](https://github.com/volarjs/volar.js/compare/v2.3.4...v2.4.0) (2024-08-18)

### Features

- **language-service, language-server:** add support for LSP [`workspaceSymbol/resolve`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_symbolResolve) request ([#213](https://github.com/volarjs/volar.js/issues/213))
- **language-service, language-server:** add support for LSP [`workspace/executeCommand`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_executeCommand) request ([#214](https://github.com/volarjs/volar.js/issues/214))
- **language-service, language-server:** add support for LSP [`textDocument/declaration`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_declaration) request
- **language-service, language-server:** add support for LSP [`textDocument/moniker`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_moniker) request
- **language-service, language-server:** add support for LSP [`textDocument/prepareTypeHierarchy`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_prepareTypeHierarchy) [`typeHierarchy/supertypes`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#typeHierarchy_supertypes) [`typeHierarchy/subtypes`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#typeHierarchy_subtypes) requests
- **language-service, language-server:** add support for LSP [`textDocument/inlineValue`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_inlineValue) request
- **monaco:** implement CancellationToken for workers ([#221](https://github.com/volarjs/volar.js/issues/221))
- **typescript:** export `replaceTscContent` for downstream usage ([#223](https://github.com/volarjs/volar.js/issues/223)) - Thanks @so1ve
- **kit:** add support for checking project references files ([#232](https://github.com/volarjs/volar.js/issues/232))

### Bug Fixes

- **language-service:** multi-level DocumentSymbol results from different virtual code are not merged accurately
- **typescript:** use Proxy instead of modifying LanguageService instance ([#216](https://github.com/volarjs/volar.js/issues/216))
- **typescript:** implement `directoryExists` for language service host
- **typescript:** improve accuracy of `runTsc` extensions parameter behavior ([#222](https://github.com/volarjs/volar.js/issues/222))
- **typescript:** synchronize script snapshots in a side-effect-free manner ([#226](https://github.com/volarjs/volar.js/issues/226))
- **typescript:** add missing workspace symbols support for TS plugin ([vuejs/language-tools#4595](https://github.com/vuejs/language-tools/issues/4595))
- **typescript:** add missing code actions support for TS plugin ([vuejs/language-tools#4586](https://github.com/vuejs/language-tools/issues/4586))
- **monaco:** can't recognize the package with type definitions in `@types/xxx` ([#81](https://github.com/volarjs/volar.js/issues/81))
- **language-server:** simplify `asFileName` result if possible ([volarjs/vscode-typescript-web#4497](https://github.com/volarjs/vscode-typescript-web/issues/3))
- **language-server:** avoid loading diagnosticMessages for en language
- **language-server:** use `Program.getSourceFile` instead of `askedFiles` to more accurately determine indirect reference files
- **language-server:** respect client `linkSupport` property for declaration, definition, typeDefinition, implementation requests
- **jsdelivr:** avoid sending read file request if `pkgFilePath` is empty
- **jsdelivr:** avoid sending flat request for `xxx.ts`, `xxx.d.ts` module names
- **jsdelivr:** avoid sending flat request for `@types/xxx` if package `xxx` do not exist
- **source-map:** don't throw when `fromOffsets` is not sorted
- **labs:** associated script mappings are not visible

### Refactors

- **language-server:** update `watchFiles` API to return Disposable
- **language-server:** only register event handlers when the language server does support a certain language feature
- **language-server:** add `setup` hook for `createTypeScriptProject` function
- **langauge-server:** improve LSP diagnostic integration ([#230](https://github.com/volarjs/volar.js/issues/230))
- **language-server:** split code based on logical concerns ([#231](https://github.com/volarjs/volar.js/issues/231))
- **typescript:** add `setup` hook for `runTsc` function
- **typescript:** add `extraExtensionsToRemove` option for `runTsc` function for glint emit support
- **typescript:** `createAsyncLanguageServicePlugin`'s `scriptKind` param allows pass a getter
- **monaco:** add `setup` hook for `createSimpleWorkerLanguageService`, `createTypeScriptWorkerService` functions
- **monaco:** replace `activateAutomaticTypeAcquisition` with `createNpmFileSystem` from the new `@volar/jsdelivr` package ([#218](https://github.com/volarjs/volar.js/issues/218)) ([#219](https://github.com/volarjs/volar.js/issues/219))
- **monaco:** rename `servicePlugins` option to `languageServicePlugins`
- **monaco:** update to `monaco-languageserver-types` 0.4 ([#225](https://github.com/volarjs/volar.js/issues/225)) - Thanks @remcohaszing
- **language-core:** no longer coupled to the TypeScript context, TypeScript properties are defined via interface merging in `@volar/typescript` ([#215](https://github.com/volarjs/volar.js/issues/215))
- **language-service:** move project context from `Language` to language service option ([#217](https://github.com/volarjs/volar.js/issues/217))
- **test-utils:** update `startLanguageServer` function to accept multiple workspace folders ([#229](https://github.com/volarjs/volar.js/issues/229))

## [2.3.4](https://github.com/volarjs/volar.js/compare/v2.3.3...v2.3.4) (2024-06-25)

### Bug Fixes

- **language-service:** `EmbeddedCodeFormattingOptions.level` value incorrect

## [2.3.3](https://github.com/volarjs/volar.js/compare/v2.3.2...v2.3.3) (2024-06-24)

### Bug Fixes

- **language-core:** move virtual code ID casing verify to language service ([vuejs/language-tools#4497](https://github.com/vuejs/language-tools/issues/4497))

## [2.3.2](https://github.com/volarjs/volar.js/compare/v2.3.1...v2.3.2) (2024-06-24)

### Bug Fixes

- **language-core:** re-export `SourceMap` ([#210](https://github.com/volarjs/volar.js/issues/210)) - Thanks @KermanX
- **language-service:** make sure provideSelectionRanges array length is valid
- **language-service:** don't format parent virtual code if formatting range inside embedded code
- **language-core:** assert virtual code ID must be lowercase
- **language-server:** fix Webpack compatibility

## [2.3.1](https://github.com/volarjs/volar.js/compare/v2.3.0...v2.3.1) (2024-06-22)

### Features

- **labs:** improving the capabilities of the virtual code editor ([#208](https://github.com/volarjs/volar.js/issues/208))

### Bug Fixes

- **labs:** language client ID should not be case sensitive
- **language-server:** fix URI conversion for file names with similar embedded code ID
- **language-server:** write virtual file command broken
- **vscode:** error tolerant to `contentChanges` length ([vuejs/language-tools#4457](https://github.com/vuejs/language-tools/issues/4457))

### Performance

- **source-map:** use binary search for `translateOffset`

### Refactors

- **source-map:** decoupling from `muggle-string`
- **source-map:** improve range mapping accuracy ([#204](https://github.com/volarjs/volar.js/issues/204))
- **source-map:** API refactoring ([Part of #206](https://github.com/volarjs/volar.js/issues/206)) - Thanks @piotrtomiak
- **language-service:** delete `SourceMapWithDocuments`, `LinkedCodeMapWithDocument`
- **language-core:** pluginized source map factory function ([#207](https://github.com/volarjs/volar.js/issues/207))

### Other Changes

- **language-service:** fix SourceMapWithDocuments virtualCode typo ([#190](https://github.com/volarjs/volar.js/issues/190)) - Thanks @machty

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
- **typescript:** ts plugin incorrectly resolve module name

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
