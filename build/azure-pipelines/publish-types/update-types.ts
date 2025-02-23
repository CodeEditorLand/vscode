/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import cp from "child_process";
import fs from "fs";
import path from "path";
let tag = "";
try {
    tag = cp
        .execSync("git describe --tags `git rev-list --tags --max-count=1`")
        .toString()
        .trim();
    const outPath = path.resolve(process.cwd(), "DefinitelyTyped/types/vscode/index.d.ts");
    cp.execSync(`curl ${`https://raw.githubusercontent.com/microsoft/vscode/${tag}/src/vscode-dts/vscode.d.ts`} --output ${outPath}`);
    updateDTSFile(outPath, tag);
    console.log(`Done updating vscode.d.ts at ${outPath}`);
}
catch (err) {
    console.error(err);
    console.error("Failed to update types");
    process.exit(1);
}
function updateDTSFile(outPath: string, tag: string) {
    fs.writeFileSync(outPath, getNewFileContent(fs.readFileSync(outPath, "utf-8"), tag));
}
function getNewFileContent(content: string, tag: string) {
    return ((str: string): string => {
        return str.replace(/\t/gm, (value) => ((str: string, times: number): string => {
            const result = new Array(times);
            for (let i = 0; i < times; i++) {
                result[i] = str;
            }
            return result.join("");
        })("    ", value.length));
    })(getNewFileHeader(tag) + content.slice([
        `/*---------------------------------------------------------------------------------------------`,
        ` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
        ` *  Licensed under the MIT License. See License.txt in the project root for license information.`,
        ` *--------------------------------------------------------------------------------------------*/`,
    ].join("\n").length));
}
function getNewFileHeader(tag: string) {
    const [major, minor] = tag.split(".");
    const shorttag = `${major}.${minor}`;
    return [
        `// Type definitions for Visual Studio Code ${shorttag}`,
        `// Project: https://github.com/microsoft/vscode`,
        `// Definitions by: Visual Studio Code Team, Microsoft <https://github.com/microsoft>`,
        `// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped`,
        ``,
        `/*---------------------------------------------------------------------------------------------`,
        ` *  Copyright (c) Microsoft Corporation. All rights reserved.`,
        ` *  Licensed under the MIT License.`,
        ` *  See https://github.com/microsoft/vscode/blob/main/LICENSE.txt for license information.`,
        ` *--------------------------------------------------------------------------------------------*/`,
        ``,
        `/**`,
        ` * Type Definition for Visual Studio Code ${shorttag} Extension API`,
        ` * See https://code.visualstudio.com/api for more information`,
        ` */`,
    ].join("\n");
}
