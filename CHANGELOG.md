# Changelog

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
