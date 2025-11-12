# Contributing to Volar.js

Thank you for your interest in contributing to Volar.js! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Package Structure](#package-structure)

## Development Setup

### Prerequisites

- **Node.js**: Version 22 or higher
- **pnpm**: Version 9.4.0 or higher
- **Git**: For version control

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/volarjs/volar.js.git
   cd volar.js
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Build all packages**

   ```bash
   pnpm run build
   ```

4. **Verify setup**
   ```bash
   pnpm run test
   ```

### Development Workflow

#### Watch Mode

For active development, use watch mode to automatically rebuild on changes:

```bash
pnpm run watch
```

This will watch all TypeScript files and rebuild when they change.

#### Building Individual Packages

You can build individual packages by navigating to their directory:

```bash
cd packages/language-core
pnpm run build
```

## Code Style

### Formatting

We use [dprint](https://dprint.dev/) for code formatting. Configuration is in `dprint.json`.

**Format code:**

```bash
pnpm run format
```

**Key formatting rules:**

- Use tabs for indentation
- Prefer single quotes for strings
- Arrow functions without parentheses when possible
- Control flow statements on next line

### Linting

We use [tsslint](https://github.com/oxc-project/tsslint) (TypeScript ESLint) for linting. Configuration is in `tsslint.config.ts`.

**Lint code:**

```bash
pnpm run lint
```

**Auto-fix linting issues:**

```bash
pnpm run lint:fix
```

**Key linting rules:**

- Use `const` for variables that don't change
- Use `===` and `!==` for equality checks
- Require curly braces for all control flow statements
- Consistent type imports (inline type imports)
- No unused variables or expressions

### TypeScript

- Use TypeScript for all new code
- Prefer type imports: `import type { ... }`
- Use explicit return types for public APIs
- Avoid `any` - use `unknown` or proper types instead

### Code Organization

- Keep files focused on a single responsibility
- Use descriptive names for functions and variables
- Add JSDoc comments for public APIs
- Group related functionality together

## Testing

### Running Tests

**Run all tests:**

```bash
pnpm run test
```

**Run tests in watch mode:**

```bash
pnpm run test -- --watch
```

**Run tests for a specific package:**

```bash
cd packages/language-core
pnpm run test
```

### Test Configuration

Tests use [Vitest](https://vitest.dev/) and are configured in `vitest.config.ts`:

- Single-threaded execution
- No isolation (for performance)

### Writing Tests

- Place test files next to source files with `.spec.ts` extension
- Use descriptive test names
- Test both success and error cases
- Keep tests focused and independent

**Example test structure:**

```typescript
import { describe, it, expect } from "vitest";

describe("MyFunction", () => {
  it("should handle normal case", () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it("should handle edge case", () => {
    const result = myFunction(edgeCaseInput);
    expect(result).toBe(expected);
  });
});
```

## Pull Request Process

### Before Submitting

1. **Ensure code builds**

   ```bash
   pnpm run build
   ```

2. **Run tests**

   ```bash
   pnpm run test
   ```

3. **Format code**

   ```bash
   pnpm run format
   ```

4. **Lint code**
   ```bash
   pnpm run lint
   ```

### Creating a Pull Request

1. **Create a branch**

   ```bash
   git checkout -b feature/my-feature
   # or
   git checkout -b fix/my-bug
   ```

2. **Make your changes**

   - Write code following our style guidelines
   - Add tests for new functionality
   - Update documentation if needed

3. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve bug"
   ```

   **Commit message conventions:**

   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactoring
   - `test:` for test additions/changes
   - `chore:` for maintenance tasks

4. **Push to your fork**

   ```bash
   git push origin feature/my-feature
   ```

5. **Create Pull Request**
   - Go to the GitHub repository
   - Click "New Pull Request"
   - Select your branch
   - Fill out the PR template
   - Submit the PR

### PR Review Process

- All PRs require review before merging
- Address review comments promptly
- Keep PRs focused and reasonably sized
- Update your branch if the main branch changes

## Package Structure

### Monorepo Organization

Volar.js uses a monorepo structure with packages in the `packages/` directory:

```
packages/
  language-core/        # Core language processing
  language-service/     # Language service features
  language-server/      # LSP server implementation
  vscode/              # VS Code client
  monaco/              # Monaco Editor integration
  kit/                 # Node.js toolkit
  typescript/          # TypeScript integration
  source-map/          # Source mapping utilities
  test-utils/          # Testing utilities
  eslint/              # ESLint integration
  jsdelivr/            # jsDelivr CDN integration
```

### Package Structure

Each package follows a consistent structure:

```
package-name/
  index.ts              # Main entry point
  lib/                  # Implementation files
    feature.ts
    utils.ts
  tests/                # Test files
    feature.spec.ts
  package.json          # Package manifest
  tsconfig.json         # TypeScript config
  README.md             # Package documentation
```

### Adding a New Package

1. Create directory in `packages/`
2. Add `package.json` with proper name and dependencies
3. Add `tsconfig.json` extending base config
4. Create `index.ts` as entry point
5. Add implementation in `lib/`
6. Add tests in `tests/`
7. Create `README.md` with documentation
8. Update root `package.json` if needed

## Documentation

### Updating Documentation

- Update package READMEs when adding features
- Add JSDoc comments for public APIs
- Update architecture docs for structural changes
- Keep examples up to date

### Documentation Style

- Use clear, concise language
- Include code examples where helpful
- Link to related documentation
- Keep formatting consistent

See [docs/CONTRIBUTING_DOCS.md](CONTRIBUTING_DOCS.md) for detailed documentation guidelines.

## Getting Help

- **Issues**: Open an issue on GitHub for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check the [docs/](docs/) directory

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Help others learn and grow

Thank you for contributing to Volar.js!
