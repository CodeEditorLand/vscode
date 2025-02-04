/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { basename } from 'path';
import { asArray, getCompletionItemsFromSpecs } from '../terminalSuggestMain';
import { getTokenType } from '../tokens';
import { cdTestSuiteSpec as cdTestSuite } from './completions/cd.test';
import { codeTestSuite } from './completions/code.test';
import { testPaths, type ISuiteSpec } from './helpers';
import { codeInsidersTestSuite } from './completions/code-insiders.test';
import { lsTestSuiteSpec } from './completions/upstream/ls.test';

const testSpecs2: ISuiteSpec[] = [
	{
		name: 'Fallback to default completions',
		completionSpecs: [],
		availableCommands: [],
		testSpecs: [
			{ input: '|', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: '|.', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: '|./', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
			{ input: 'fakecommand |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		]
	},

	// completions/
	cdTestSuite,
	codeTestSuite,
	codeInsidersTestSuite,

	// completions/upstream/
	lsTestSuiteSpec,
];

suite('Terminal Suggest', () => {
	for (const suiteSpec of testSpecs2) {
		suite(suiteSpec.name, () => {
			const completionSpecs = asArray(suiteSpec.completionSpecs);
			const availableCommands = asArray(suiteSpec.availableCommands);
			for (const testSpec of suiteSpec.testSpecs) {
				let expectedString = testSpec.expectedCompletions ? `[${testSpec.expectedCompletions.map(e => `'${e}'`).join(', ')}]` : '[]';
				if (testSpec.expectedResourceRequests) {
					expectedString += ` + ${testSpec.expectedResourceRequests.type}`;
					if (testSpec.expectedResourceRequests.cwd.fsPath !== testPaths.cwd.fsPath) {
						expectedString += ` @ ${basename(testSpec.expectedResourceRequests.cwd.fsPath)}/`;
					}
				}
				test(`'${testSpec.input}' -> ${expectedString}`, async () => {
					const commandLine = testSpec.input.split('|')[0];
					const cursorPosition = testSpec.input.indexOf('|');
					const prefix = commandLine.slice(0, cursorPosition).split(' ').at(-1) || '';
					const filesRequested = testSpec.expectedResourceRequests?.type === 'files' || testSpec.expectedResourceRequests?.type === 'both';
					const foldersRequested = testSpec.expectedResourceRequests?.type === 'folders' || testSpec.expectedResourceRequests?.type === 'both';
					const terminalContext = { commandLine, cursorPosition };
					const result = await getCompletionItemsFromSpecs(
						completionSpecs,
						terminalContext,
						availableCommands.map(c => { return { label: c }; }),
						prefix,
						getTokenType(terminalContext, undefined),
						testPaths.cwd
					);
					deepStrictEqual(result.items.map(i => i.label).sort(), (testSpec.expectedCompletions ?? []).sort());
					strictEqual(result.filesRequested, filesRequested);
					strictEqual(result.foldersRequested, foldersRequested);
					if (testSpec.expectedResourceRequests?.cwd) {
						strictEqual(result.cwd?.fsPath, testSpec.expectedResourceRequests.cwd.fsPath);
					}
				});
			}
		});
	}
});
