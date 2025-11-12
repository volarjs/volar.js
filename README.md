# Volar.js

A powerful, extensible language service framework for building IDE features and language servers. Volar.js provides a modular architecture for creating language support with features like IntelliSense, diagnostics, formatting, and more.

## Table of Contents

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Architecture Overview](#architecture-overview)
- [Packages](#packages)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## Getting Started

Volar.js is a monorepo containing multiple packages that work together to provide language service capabilities. The core packages form a layered architecture:

1. **@volar/language-core** - Core language processing (virtual code, mappings)
2. **@volar/language-service** - Language service features (IntelliSense, diagnostics, etc.)
3. **@volar/language-server** - LSP server implementation
4. Integration packages - VS Code, Monaco Editor, Node.js kit

### Quick Example

```typescript
import { createLanguage } from "@volar/language-core";
import { createLanguageService } from "@volar/language-service";
import { URI } from "vscode-uri";

// Create a language instance with plugins
const language = createLanguage(
  [
    /* your language plugins */
  ],
  new Map(),
  (id) => {
    /* sync function */
  }
);

// Create a language service
const languageService = createLanguageService(
  language,
  [
    /* your service plugins */
  ],
  { workspaceFolders: [URI.parse("file:///")] },
  {}
);

// Use the language service
const completions = await languageService.getCompletionItems(
  URI.parse("file:///example.ts"),
  { line: 0, character: 10 }
);
```

For more detailed examples, see the [package documentation](#packages) and [examples directory](docs/examples/).

## Installation

### Prerequisites

- Node.js 22 or higher
- pnpm 9.4.0 or higher

### Installing Dependencies

```bash
# Clone the repository
git clone https://github.com/volarjs/volar.js.git
cd volar.js

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

### Using Packages

Install individual packages via npm:

```bash
npm install @volar/language-core
npm install @volar/language-service
npm install @volar/language-server
# ... etc
```

## Architecture Overview

Volar.js follows a layered architecture where each layer builds upon the previous:

```
┌─────────────────────────────────────────────────────────┐
│              Editor Integration Layer                    │
│  @volar/vscode  │  @volar/monaco  │  @volar/kit        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Language Server Protocol Layer               │
│              @volar/language-server                      │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Language Service Layer                      │
│              @volar/language-service                    │
│  (30+ language features: completion, hover, etc.)        │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Core Language Processing Layer               │
│              @volar/language-core                       │
│  (VirtualCode, SourceScript, LanguagePlugin)            │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Supporting Packages                         │
│  @volar/typescript  │  @volar/source-map  │  ...        │
└─────────────────────────────────────────────────────────┘
```

### Core Concepts

- **VirtualCode**: Generated code representations (e.g., TypeScript code generated from Vue templates)
- **SourceScript**: Original source files with their metadata
- **LanguagePlugin**: Transforms source files into VirtualCode
- **LanguageServicePlugin**: Provides language service features (completion, hover, etc.)
- **Mapper**: Maps between source and virtual code positions

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Packages

```
@volar/language-core
  |
  |--- @volar/language-service
        |
        |--- @volar/language-server
        |     |
        |     |--- @volar/vscode (as a client to the language server)
        |
        |--- @volar/kit (encapsulates @volar/language-service for Node.js applications)
        |
        |--- @volar/monaco (integrates @volar/language-service into Monaco Editor)
```

### Core Packages

#### @volar/language-core

The foundation of Volar.js. Provides core language processing functionalities including:

- Virtual code creation and management
- Source-to-virtual code mapping
- Language plugin system
- Script registry and synchronization

**Documentation**: [packages/language-core/README.md](packages/language-core/README.md)

#### @volar/language-service

Builds on `@volar/language-core` to provide language service features:

- 30+ language features (completion, hover, diagnostics, formatting, etc.)
- Language service plugin system
- Feature worker pattern for efficient processing
- Embedded document URI handling

**Documentation**: [packages/language-service/README.md](packages/language-service/README.md)

#### @volar/language-server

Implements a Language Server Protocol (LSP) server:

- LSP protocol handling
- Project management (TypeScript, Simple)
- File system providers (Node.js, HTTP)
- Server lifecycle management

**Documentation**: [packages/language-server/README.md](packages/language-server/README.md)

### Integration Packages

#### @volar/vscode

VS Code extension client for LSP:

- LSP client implementation
- VS Code API integration
- Configuration management
- Client-server communication

**Documentation**: [packages/vscode/README.md](packages/vscode/README.md)

#### @volar/monaco

Monaco Editor integration:

- Worker-based language service
- TypeScript support
- Auto Type Acquisition (ATA)
- Editor feature providers

**Documentation**: [packages/monaco/README.md](packages/monaco/README.md)

#### @volar/kit

Node.js application toolkit:

- Simplified API for linting and formatting
- Project creation utilities
- Service environment setup
- File watcher integration

**Documentation**: [packages/kit/README.md](packages/kit/README.md)

### Supporting Packages

#### @volar/typescript

TypeScript integration utilities:

- TypeScript language plugin support
- Service script system
- Program decoration and proxying
- Protocol integration

**Documentation**: [packages/typescript/README.md](packages/typescript/README.md)

#### @volar/source-map

Source mapping functionality:

- Position mapping between source and generated code
- Binary search utilities
- Mapping data structures

**Documentation**: [packages/source-map/README.md](packages/source-map/README.md)

#### @volar/test-utils

Testing utilities:

- Language server testing helpers
- Mock server creation
- Test document management

**Documentation**: [packages/test-utils/README.md](packages/test-utils/README.md)

#### @volar/eslint

ESLint integration:

- ESLint rule integration
- Diagnostic conversion

**Documentation**: [packages/eslint/README.md](packages/eslint/README.md)

#### @volar/jsdelivr

jsDelivr CDN integration:

- NPM package file system
- Auto Type Acquisition (ATA)
- CDN-based type resolution

**Documentation**: [packages/jsdelivr/README.md](packages/jsdelivr/README.md)

## Documentation

Comprehensive documentation is available in the `docs/` directory:

- **[Architecture Guide](docs/ARCHITECTURE.md)** - System architecture and design
- **[Data Flow](docs/DATA_FLOW.md)** - How data flows through the system
- **[Plugin System](docs/PLUGINS.md)** - Creating and using plugins
- **[API Reference](docs/API.md)** - Complete API documentation
- **[Examples](docs/examples/)** - Usage examples and guides
- **[LLM Documentation](docs/llm/)** - Documentation optimized for LLM consumption

### Package Documentation

Each package has its own README with detailed documentation:

- [@volar/language-core](packages/language-core/README.md)
- [@volar/language-service](packages/language-service/README.md)
- [@volar/language-server](packages/language-server/README.md)
- [@volar/vscode](packages/vscode/README.md)
- [@volar/monaco](packages/monaco/README.md)
- [@volar/kit](packages/kit/README.md)
- [@volar/typescript](packages/typescript/README.md)
- [@volar/source-map](packages/source-map/README.md)
- [@volar/test-utils](packages/test-utils/README.md)
- [@volar/eslint](packages/eslint/README.md)
- [@volar/jsdelivr](packages/jsdelivr/README.md)

## Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details on:

- Development setup
- Code style guidelines
- Testing requirements
- Pull request process

### Development Workflow

```bash
# Install dependencies
pnpm install

# Build in watch mode
pnpm run watch

# Run tests
pnpm run test

# Format code
pnpm run format

# Lint code
pnpm run lint
pnpm run lint:fix
```

## Troubleshooting

### Common Issues

**Build errors**

- Ensure you're using Node.js 22+ and pnpm 9.4.0+
- Clear `node_modules` and reinstall: `rm -rf node_modules && pnpm install`
- Rebuild: `pnpm run build`

**Type errors**

- Run `pnpm run build` to generate type definitions
- Ensure all dependencies are installed

**Test failures**

- Check that all packages are built: `pnpm run build`
- Ensure test environment is set up correctly

**LSP connection issues**

- Check server logs for errors
- Verify workspace folder configuration
- Ensure file system providers are correctly configured

For more help, please [open an issue](https://github.com/volarjs/volar.js/issues).

## ❤️ Thanks to Our Sponsors

This project is made possible thanks to our generous sponsors:

<table>
  <tbody>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <b>Special Sponsor</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <br>
        <a href="https://voidzero.dev/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/VoidZero.svg" height="60" />
        </a>
        <h3>Next Generation Tooling</h3>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <b>Platinum Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" width="50%"  colspan="3">
        <a href="https://vuejs.org/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Vue.svg" height="80" />
        </a>
        <p>An approachable, performant and versatile framework for building web user interfaces.</p>
      </td>
      <td align="center" valign="middle" width="50%" colspan="6">
        <a href="https://stackblitz.com/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/StackBlitz.svg" width="240" />
        </a>
        <p>Stay in the flow with instant dev experiences.<br>No more hours stashing/pulling/installing locally</p>
        <p><b> — just click, and start coding.</b></p>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <b>Gold Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <a href="https://www.jetbrains.com/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/JetBrains.svg" width="80" />
        </a>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="6">
        <b>Silver Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" width="33.3%" colspan="2">
      </td>
      <td align="center" valign="middle" width="33.3%" colspan="2">
        <a href="https://www.prefect.io/"><img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Prefect.svg" width="200" /></a>
      </td>
      <td align="center" valign="middle" width="33.3%" colspan="2">
      </td>
    </tr>
  </tbody>
</table>

<p align="center">
	<a href="https://github.com/sponsors/johnsoncodehk">Become a sponsor</a>
</p>
