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
          <img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/StackBlitz.png" height="80" />
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
      <td align="center" valign="middle">
        <a href="https://vuejs.org/">
          <img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/Vue.svg" height="80" />
        </a>
        <p>An approachable, performant and versatile framework for building web user interfaces.</p>
      </td>
      <td align="center" valign="middle">
        <a href="https://astro.build/">
          <img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/Astro.svg" height="80" />
        </a>
        <p>Astro powers the world's fastest websites, client-side web apps, dynamic API endpoints, and everything in-between.</p>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle">
        <a href="[https://astro.build/](https://www.jetbrains.com/)">
          <img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/JetBrains.svg" height="80" />
        </a>
        <p>However big or small your team is, our products will ensure that it always has a smooth and enjoyable experience when <br><a class="rs-link rs-link_mode_classic rs-link_theme_dark product-type-link" href="/products/#type=ci-cd"><span><svg viewBox="0 0 24 24" class="_icon_1lgbkjk_3 _sizeM_1lgbkjk_17 product-type-link__icon"><path d="M13.281 3L8.596 20.483l1.93.517 4.686-17.482L13.282 3zm2.002 4.67l4.291 4.324-4.29 4.326 1.413 1.424 5.704-5.75-5.704-5.75-1.414 1.425zM4.227 11.993l4.291 4.326-1.414 1.424-5.704-5.75 5.704-5.75L8.518 7.67l-4.29 4.325z"></path></svg>building</span> your code</a>, <a class="rs-link rs-link_mode_classic rs-link_theme_dark product-type-link" href="/products/#type=pm"><span><svg viewBox="0 0 24 24" class="_icon_1lgbkjk_3 _sizeM_1lgbkjk_17 product-type-link__icon"><path d="M6 4h2v2h8V4h2v2h2v2H4V6h2V4zM4.586 20.414A2 2 0 014 19v-9h16v9a2 2 0 01-2 2H6a2 2 0 01-1.414-.586zM17 13h-3v3h3v-3z"></path></svg>planning</span> your work</a>, or <a class="rs-link rs-link_mode_classic rs-link_theme_dark product-type-link" href="/products/#type=code-review"><span><svg viewBox="0 0 24 24" class="_icon_1lgbkjk_3 _sizeM_1lgbkjk_17 product-type-link__icon"><path d="M8.628 12.018h.005l-4.071 4.441-4.063-4.443h3.066v-.017a8.482 8.482 0 0112.854-7.286l-1.47 1.47a6.486 6.486 0 00-9.385 5.816l.001.017H8.63l-.002.002zm6.79-.005h-.006l4.072-4.441 4.062 4.443h-3.064A8.483 8.483 0 017.5 19.211l1.46-1.459a6.492 6.492 0 009.522-5.737h-3.067l.002-.002z"></path></svg>collaborating</span></a>.</p>
      </td>
      <td align="center" valign="middle">
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle" colspan="2">
        <b>Silver Sponsors</b>
      </td>
    </tr>
    <tr>
      <td align="center" valign="middle">
        <a href="https://www.prefect.io/"><img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/Prefect.svg" height="50" /></a>
      </td>
      <td align="center" valign="middle">
        <a href="https://www.techjobasia.com/"><img src="https://cdn.jsdelivr.net/gh/johnsoncodehk/sponsors/logos/TechJobAsia.png" height="50" /></a>
      </td>
    </tr>
  </tbody>
</table>

<p align="center">
	<a href="https://github.com/sponsors/johnsoncodehk">Become a sponsor</a>
</p>
