# Kit

## Example: Use FileWatcher

```ts
import * as fs from 'fs';
import * as path from 'path';
import { watch } from 'chokidar';
import * as kit from '@volar/kit';

const tsconfig = getTsconfig();
const project = kit.createProject(tsconfig, [{ extension: 'foo', isMixedContent: true, scriptKind: 7 }]);
const config: kit.Config = {
    languages: {
        // ...
    },
    services: {
        // ...
    },
};
const linter = kit.createLinter(config, project.languageServiceHost);

let req = 0;

update();

createWatcher(path.dirname(tsconfig), ['ts', 'js', 'foo'])
    .on('add', (fileName) => {
        project.fileCreated(fileName);
        update();
    })
    .on('unlink', (fileName) => {
        project.fileDeleted(fileName);
        update(fileName);
    })
    .on('change', (fileName) => {
        project.fileUpdated(fileName);
        update(fileName);
    });

function createWatcher(rootPath: string, extension: string[]) {
    return watch(`${rootPath}/**/*.{${extension.join(',')}}`, {
        ignored: (path) => path.includes('node_modules'),
        ignoreInitial: true
    });
}

async function update(fileNameCheckRelated?: string) {

    if (fileNameCheckRelated && !project.isKnownRelatedFile(fileNameCheckRelated))
        return;

    const currentReq = ++req;
    const isCanceled = () => currentReq !== req;
    await new Promise(resolve => setTimeout(resolve, 100));
    if (isCanceled()) return;

    process.stdout.write('\x1Bc'); // clear console

    let hasError = false;
    for (const fileName of project.languageServiceHost.getScriptFileNames()) {
        const errors = await linter.check(fileName);
        if (isCanceled()) return;
        if (errors.length) {
            linter.logErrors(fileName, errors);
            hasError = true;
        }
    }
    if (!hasError) {
        console.log('No errors');
    }
}

function getTsconfig() {

    let tsconfig = path.resolve(process.cwd(), './tsconfig.json');

    const tsconfigIndex = process.argv.indexOf('--tsconfig');
    if (tsconfigIndex >= 0) {
        tsconfig = path.resolve(process.cwd(), process.argv[tsconfigIndex + 1]);
    }

    if (!fs.existsSync(tsconfig)) {
        throw `tsconfig.json not found: ${tsconfig}`;
    }

    return tsconfig;
}
```
