/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const rootDir = path.resolve(__dirname, "..", "..");
function runProcess(command: string, args: ReadonlyArray<string> = []) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: rootDir,
            stdio: "inherit",
            env: process.env,
            shell: process.platform === "win32",
        });
        child.on("exit", (err) => (!err ? resolve() : process.exit(err ?? 1)));
        child.on("error", reject);
    });
}
async function exists(subdir: string) {
    try {
        await fs.stat(path.join(rootDir, subdir));
        return true;
    }
    catch {
        return false;
    }
}
if (require.main === module) {
    (async () => {
        await (async () => {
            if (!(await exists("node_modules"))) {
                await runProcess(npm, ["ci"]);
            }
        })();
        await (async () => {
            await runProcess(npm, ["run", "electron"]);
        })();
        await (async () => {
            if (!(await exists("out"))) {
                await runProcess(npm, ["run", "compile"]);
            }
        })();
        // Can't require this until after dependencies are installed
        const { getBuiltInExtensions } = require("./builtInExtensions");
        await getBuiltInExtensions();
    })().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
