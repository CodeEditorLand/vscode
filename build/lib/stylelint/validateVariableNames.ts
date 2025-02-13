/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { readFileSync } from "fs";
import path from "path";
const RE_VAR_PROP = /var\(\s*(--([\w\-\.]+))/g;
let knownVariables: Set<string> | undefined;
export interface IValidator {
    (value: string, report: (message: string) => void): void;
}
export function getVariableNameValidator(): IValidator {
    return (value: string, report: (unknwnVariable: string) => void) => {
        RE_VAR_PROP.lastIndex = 0; // reset lastIndex just to be sure
        let match;
        while ((match = RE_VAR_PROP.exec(value))) {
            const variableName = match[1];
            if (variableName &&
                !(() => {
                    if (!knownVariables) {
                        const knownVariablesInfo = JSON.parse(readFileSync(path.join(__dirname, "./vscode-known-variables.json"), "utf8").toString());
                        knownVariables = new Set([
                            ...knownVariablesInfo.colors,
                            ...knownVariablesInfo.others,
                        ] as string[]);
                    }
                    return knownVariables;
                })().has(variableName) &&
                !/^--vscode-icon-.+-(content|font-family)$/.test(variableName)) {
                report(variableName);
            }
        }
    };
}
