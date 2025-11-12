# Documentation Contributing Guide

Guidelines for writing and maintaining documentation for Volar.js.

## Documentation Style Guide

### Writing Style

- **Clear and concise**: Use simple, direct language
- **Active voice**: Prefer "Creates a language instance" over "A language instance is created"
- **Consistent terminology**: Use the same terms throughout (e.g., "virtual code" not "generated code")
- **Code-first**: Show code examples early, explain concepts with examples

### Structure

1. **Overview**: Brief description of what the package/feature does
2. **Installation**: How to install
3. **Core Concepts**: Key concepts explained
4. **API Reference**: Detailed API documentation
5. **Examples**: Practical examples
6. **Related Documentation**: Links to related docs

### Headings

- Use descriptive headings
- Use sentence case for headings
- Keep heading hierarchy logical (H2 → H3 → H4)

## Code Example Formatting

### TypeScript Examples

```typescript
// Always include imports
import { createLanguage } from "@volar/language-core";
import { URI } from "vscode-uri";

// Use descriptive variable names
const language = createLanguage(plugins, registry, sync);

// Include comments for clarity
const sourceScript = language.scripts.get(uri); // Get source script
```

### Code Block Labels

Always label code blocks with language:

````markdown
```typescript
// TypeScript code
```

```bash
# Shell commands
```
````

### Inline Code

Use backticks for:

- Package names: `@volar/language-core`
- Function names: `createLanguage()`
- Type names: `VirtualCode`
- File paths: `packages/language-core/index.ts`

## Link Conventions

### Internal Links

- Use relative paths: `[Architecture Guide](ARCHITECTURE.md)`
- Link to package READMEs: `[@volar/language-core](../packages/language-core/README.md)`
- Link to sections: `[API Reference](#api-reference)`

### External Links

- Use descriptive link text: `[Language Server Protocol](https://microsoft.github.io/language-server-protocol/)`
- Include full URLs for external resources

## Update Procedures

### When to Update Documentation

- **New features**: Document new APIs and features
- **API changes**: Update when APIs change
- **Bug fixes**: Update if documentation was incorrect
- **Examples**: Update if examples become outdated

### Documentation Review

- Review documentation in PRs
- Ensure examples are tested and work
- Check links are valid
- Verify code examples compile

## Package README Structure

Each package README should follow this structure:

1. **Title**: Package name as H1
2. **Overview**: What the package does
3. **Installation**: How to install
4. **Core Concepts**: Key concepts (if applicable)
5. **API Reference**: All exported APIs
6. **Examples**: Usage examples
7. **Related Documentation**: Links to related docs

## API Documentation Standards

### Function Documentation

````markdown
### functionName

Brief description of what the function does.

```typescript
function functionName(param1: Type1, param2?: Type2): ReturnType;
```
````

**Parameters:**

- `param1`: Description of parameter
- `param2`: Description of optional parameter

**Returns:** Description of return value

**Example:**
\`\`\`typescript
const result = functionName(arg1, arg2);
\`\`\`

````

### Interface Documentation

```markdown
### InterfaceName

Description of the interface.

**Properties:**
- `property1: Type` - Description
- `property2?: Type` - Description of optional property

**Example:**
\`\`\`typescript
const obj: InterfaceName = {
  property1: value1
};
\`\`\`
````

## Example Documentation Standards

### Complete Examples

Examples should be:

- **Complete**: Include all necessary imports and setup
- **Runnable**: Code should work when copied
- **Clear**: Use descriptive variable names
- **Commented**: Add comments for clarity

### Example Structure

```markdown
### Example: Feature Name

Brief description of what the example demonstrates.

\`\`\`typescript
// Step 1: Setup
import { ... } from '...';

// Step 2: Implementation
const instance = createInstance(...);

// Step 3: Usage
const result = instance.doSomething();
\`\`\`

**Explanation:**

- Step 1 does X
- Step 2 does Y
- Step 3 produces Z
```

## Markdown Best Practices

### Lists

- Use bullet points for unordered lists
- Use numbered lists for sequential steps
- Keep list items parallel in structure

### Tables

Use tables for structured data:

```markdown
| Parameter  | Type       | Description     |
| ---------- | ---------- | --------------- |
| `uri`      | `URI`      | Document URI    |
| `position` | `Position` | Cursor position |
```

### Code Blocks

- Always specify language
- Keep code blocks focused (don't include unnecessary code)
- Use ellipsis for omitted code: `// ... more code`

## LLM Documentation Standards

LLM documentation should be:

- **Structured**: Use clear sections and headings
- **Complete**: Include all necessary information
- **Concise**: Avoid unnecessary verbosity
- **Examples**: Include code examples
- **Type-focused**: Emphasize types and interfaces

## Checklist

Before submitting documentation:

- [ ] All code examples are tested
- [ ] All links are valid
- [ ] Terminology is consistent
- [ ] Examples are complete and runnable
- [ ] API documentation is accurate
- [ ] Related documentation links are included
- [ ] Markdown formatting is correct
