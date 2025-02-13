/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import minimatch from "minimatch";
import { makeUniversalApp } from "vscode-universal-bundler";
if (require.main === module) {
    (async (buildDir?: string) => {
        if (!buildDir) {
            throw new Error("Build dir not provided");
        }
        const appName = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(__dirname)), "product.json"), "utf8")).nameLong + ".app";
        const x64AppPath = path.join(buildDir, "VSCode-darwin-x64", appName);
        const arm64AppPath = path.join(buildDir, "VSCode-darwin-arm64", appName);
        const productJsonPath = path.resolve(path.join(buildDir, `VSCode-darwin-${process.env["VSCODE_ARCH"]}`, appName), "Contents", "Resources", "app", "product.json");
        await makeUniversalApp({
            x64AppPath,
            arm64AppPath,
            asarPath: path.join("Contents", "Resources", "app", "node_modules.asar"),
            outAppPath,
            force: true,
            mergeASARs: true,
            x64ArchFiles: "*/kerberos.node",
            filesToSkipComparison: (file: string) => {
                for (const expected of [
                    "**/CodeResources",
                    "**/Credits.rtf",
                    // TODO: Should we consider expanding this to other files in this area?
                    "**/node_modules/@parcel/node-addon-api/nothing.target.mk",
                ]) {
                    if (minimatch(file, expected)) {
                        return true;
                    }
                }
                return false;
            },
        });
        const productJson = JSON.parse(fs.readFileSync(productJsonPath, "utf8"));
        Object.assign(productJson, {
            darwinUniversalAssetId: "darwin-universal",
        });
        fs.writeFileSync(productJsonPath, JSON.stringify(productJson, null, "\t"));
    })(process.argv[2]).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
