/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
const root = path.join(__dirname, "..", "..");
/**
 * Writes a `outDir/date` file with the contents of the build
 * so that other tasks during the build process can use it and
 * all use the same date.
 */
export function writeISODate(outDir: string) {
    const result = () => new Promise<void>((resolve, _) => {
        const outDirectory = path.join(root, outDir);
        fs.mkdirSync(outDirectory, { recursive: true });
        fs.writeFileSync(path.join(outDirectory, "date"), new Date().toISOString(), "utf8");
        resolve();
    });
    result.taskName = "build-date-file";
    return result;
}
export function readISODate(outDir: string): string {
    return fs.readFileSync(path.join(path.join(root, outDir), "date"), "utf8");
}
