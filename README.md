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
