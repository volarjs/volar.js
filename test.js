const tscContent = require('fs').readFileSync(require.resolve('typescript/lib/_tsc.js'), 'utf8');
console.time('regex');
const requireRegex = /module\.exports\s*=\s*require\((?:"|')(?<path>\.\/\w+\.js)(?:"|')\)/;
const requirePath = requireRegex.exec(tscContent)?.groups?.path;
console.log(isMainTsc(tscContent));
console.timeEnd('regex');
console.log(requirePath);


function isMainTsc(tsc) {
	// We assume it's the main tsc module if it has a `version` variable defined with a semver string
	const versionRegex = /(?:var|const|let)\s+version\s*=\s*(?:"|')\d+\.\d+\.\d+(?:"|')/;
	return versionRegex.test(tsc);
}
