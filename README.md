# Volar.js

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

### @volar/language-core

This module contains the core language processing functionalities, such as creating and updating virtual code objects. It serves as the foundation for the other modules, providing basic language processing capabilities.

### @volar/language-service

This module provides language service functionalities, such as offering IntelliSense features. It depends on `@volar/language-core` for obtaining and processing virtual code, and then provides corresponding language services.

### @volar/language-server

This module acts as a language server, utilizing the language services provided by `@volar/language-service` and offering these services to clients (like VS Code) through the Language Server Protocol (LSP). It also relies on `@volar/language-core` for handling basic language processing tasks.

### @volar/vscode

This module acts as a Language Server Protocol (LSP) language client. Its primary responsibility is to communicate with the `@volar/language-server` module (acting as an LSP server) and integrate the language services provided by the server into the VS Code editor. This architecture allows for the reuse of language services across different editors and IDEs, with the implementation of the corresponding LSP client. In this case, `@volar/vscode` is the LSP client implementation for VS Code.

### @volar/kit

`@volar/kit` is a module that encapsulates `@volar/language-service`. It provides a simplified interface for using Volar's diagnostic and formatting features within Node.js applications.

### @volar/monaco

This module is an extension of Volar.js for the Monaco Editor. It utilizes the language services provided by `@volar/language-service` and integrates these services into the Monaco Editor. This includes features like syntax highlighting, code completion, and definition jumping. Essentially, `@volar/monaco` serves as a bridge to bring Volar.js's language services into the Monaco Editor.

## Sponsors

<table>
  <tbody>
    <tr>
      <td align="center" valign="middle" colspan="2">
        <b>Special Sponsor</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="2">
        <a href="https://stackblitz.com/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/StackBlitz.svg" height="80" />
        </a>
        <p>Stay in the flow with instant dev experiences.<br>No more hours stashing/pulling/installing locally</p>
        <p><b> — just click, and start coding.</b></p>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="2">
        <b>Platinum Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" width="50%">
        <a href="https://vuejs.org/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Vue.svg" height="80" />
        </a>
        <p>An approachable, performant and versatile framework for building web user interfaces.</p>
      </td>
      <td align="center" valign="middle" width="50%">
        <a href="https://astro.build/">
          <!-- Expire: 2025-02-04 -->
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Astro.svg" height="80" />
        </a>
        <p>Astro powers the world's fastest websites, client-side web apps, dynamic API endpoints, and everything in-between.</p>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle">
        <!-- Expire: 2025-02-04 -->
        <a href="https://www.jetbrains.com/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/JetBrains.svg" height="80" />
        </a>
        <p>Essential tools for software developers and teams.</p>
      </td>
      <td align="center" valign="middle">
        <!-- Expire: 2024-08-16 -->
        <a href="https://opensource.microsoft.com/">
          <img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Microsoft.svg" height="80" />
        </a>
        <p>Open Source enables Microsoft products and services to bring choice, technology and community to our customers.</p>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="2">
        <b>Silver Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle">
        <a href="https://www.prefect.io/"><img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/Prefect.svg" height="50" /></a>
      </td>
      <td align="center" valign="middle">
        <a href="https://www.techjobasia.com/"><img src="https://raw.githubusercontent.com/johnsoncodehk/sponsors/master/logos/TechJobAsia.svg" height="50" /></a>
      </td>
    </tr>
  </tbody>
</table>

<p align="center">
	<a href="https://github.com/sponsors/johnsoncodehk">Become a sponsor</a>
</p>
