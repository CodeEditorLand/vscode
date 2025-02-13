/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
const { dirs } = require("../../npm/dirs") as {
    dirs: string[];
};
function log(...args: any[]): void {
    console.log(`[${new Date().toLocaleTimeString("en", { hour12: false })}]`, "[distro]", ...args);
}
(() => {
    log(`Mixing in distro npm dependencies...`);
    for (const mixinPath of dirs.filter((d) => /^.build\/distro\/npm/.test(d))) {
        ((mixinPath: string) => {
            if (!fs.existsSync(`${mixinPath}/node_modules`)) {
                log(`Skipping distro npm dependencies: ${mixinPath} (no node_modules)`);
                return;
            }
            log(`Mixing in distro npm dependencies: ${mixinPath}`);
            const targetPath = path.relative(".build/distro/npm", mixinPath);
            for (const dependency of Object.keys(JSON.parse(fs.readFileSync(`${mixinPath}/package.json`, "utf8")).dependencies)) {
                fs.rmSync(`./${targetPath}/node_modules/${dependency}`, {
                    recursive: true,
                    force: true,
                });
                fs.cpSync(`${mixinPath}/node_modules/${dependency}`, `./${targetPath}/node_modules/${dependency}`, { recursive: true, force: true, dereference: true });
            }
            log(`Mixed in distro npm dependencies: ${mixinPath} ✔︎`);
        })(mixinPath);
    }
})();
