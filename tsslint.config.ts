import { defineConfig } from '@tsslint/config';
import type * as ts from 'typescript';

export default defineConfig({
	rules: {
		'interface-property-semicolon'({ typescript: ts, sourceFile, reportWarning }) {
			const { text } = sourceFile;
			ts.forEachChild(sourceFile, function walk(node) {
				if (ts.isInterfaceDeclaration(node)) {
					for (const member of node.members) {
						if (text[member.end - 1] !== ';') {
							reportWarning(
								`Interface properties should end with a semicolon.`,
								member.getStart(sourceFile),
								member.getEnd()
							).withFix(
								'Replace comma with semicolon',
								() => [{
									fileName: sourceFile.fileName,
									textChanges: [{
										newText: ';',
										span: {
											start: member.end - 1,
											length: 1,
										},
									}],
								}]
							);
						}
					}
				}
				ts.forEachChild(node, walk);
			});
		},
		'braces-around-statements'({ typescript: ts, sourceFile, reportWarning }) {
			ts.forEachChild(sourceFile, function walk(node) {
				if (ts.isIfStatement(node)) {
					if (!ts.isBlock(node.thenStatement)) {
						reportWithFix(node.thenStatement);
					}
					if (node.elseStatement && !ts.isIfStatement(node.elseStatement) && !ts.isBlock(node.elseStatement)) {
						reportWithFix(node.elseStatement);
					}
				}
				// @ts-expect-error
				else if ('statement' in node && ts.isStatement(node.statement)) {
					const statement = node.statement;
					if (!ts.isBlock(node.statement)) {
						reportWithFix(statement);
					}
				}
				ts.forEachChild(node, walk);
			});
			function reportWithFix(statement: ts.Statement) {
				reportWarning(
					`Statements should be wrapped in braces.`,
					statement.getStart(sourceFile),
					statement.getEnd()
				).withFix(
					'Add braces around the statement',
					() => [{
						fileName: sourceFile.fileName,
						textChanges: [
							{
								newText: isSameLine(statement)
									? ' {\n'
									: ' {',
								span: {
									start: statement.getFullStart(),
									length: 0,
								},
							},
							{
								newText: '\n}',
								span: {
									start: statement.getEnd(),
									length: 0,
								},
							}
						],
					}]
				);
			}
			function isSameLine(node: ts.Node) {
				return ts.getLineAndCharacterOfPosition(sourceFile, node.getFullStart()).line
					=== ts.getLineAndCharacterOfPosition(sourceFile, node.parent.getEnd()).line;
			}
		},
		'typescript-import-type'({ typescript: ts, sourceFile, reportError }) {
			ts.forEachChild(sourceFile, function walk(node) {
				if (ts.isImportDeclaration(node) && node.moduleSpecifier.getText(sourceFile).slice(1, -1) === 'typescript' && !node.importClause?.isTypeOnly) {
					reportError(
						`Importing 'typescript' should use 'import type'.`,
						node.getStart(sourceFile),
						node.getEnd()
					).withFix(
						'Add "type" to import statement',
						() => [{
							fileName: sourceFile.fileName,
							textChanges: [{
								newText: 'import type',
								span: {
									start: node.getStart(sourceFile),
									length: 'import'.length,
								},
							}],
						}]
					);
				}
				ts.forEachChild(node, walk);
			});
		},
		'need-format'({ typescript: ts, sourceFile, languageService, reportWarning }) {
			const textChanges = languageService.getFormattingEditsForDocument(sourceFile.fileName, {
				...ts.getDefaultFormatCodeSettings(),
				convertTabsToSpaces: false,
				tabSize: 4,
				indentSize: 4,
				indentStyle: ts.IndentStyle.Smart,
				newLineCharacter: '\n',
				insertSpaceAfterCommaDelimiter: true,
				insertSpaceAfterConstructor: false,
				insertSpaceAfterSemicolonInForStatements: true,
				insertSpaceBeforeAndAfterBinaryOperators: true,
				insertSpaceAfterKeywordsInControlFlowStatements: true,
				insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
				insertSpaceBeforeFunctionParenthesis: false,
				insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
				insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
				insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
				insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: true,
				insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
				insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
				insertSpaceAfterTypeAssertion: false,
				placeOpenBraceOnNewLineForFunctions: false,
				placeOpenBraceOnNewLineForControlBlocks: false,
				semicolons: ts.SemicolonPreference.Ignore,
			});
			for (const textChange of textChanges) {
				const originalText = sourceFile.text.slice(textChange.span.start, textChange.span.start + textChange.span.length);
				if (originalText !== textChange.newText) {
					reportWarning(
						`The document is not formatted.`,
						textChange.span.start,
						textChange.span.start + textChange.span.length
					).withFix(
						'Format the file',
						() => [{
							fileName: sourceFile.fileName,
							textChanges: [textChange],
						}]
					);
				}
			}
		},
	},
	plugins: [
		ctx => ({
			resolveRules(rules) {
				if (ctx.tsconfig.endsWith('/kit/tsconfig.json')) {
					const newRules = { ...rules };
					delete newRules['typescript-import-type'];
					return newRules;
				}
				return rules;
			},
		}),
	]
});
