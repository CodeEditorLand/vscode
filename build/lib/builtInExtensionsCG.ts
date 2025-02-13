/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import url from "url";
import ansiColors from "ansi-colors";
import { IExtensionDefinition } from "./builtInExtensions";
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../product.json"), "utf8"));
const token = process.env["GITHUB_TOKEN"];
(async (): Promise<void> => {
    for (const extension of [...(<IExtensionDefinition[]>productjson.builtInExtensions || []), ...(<IExtensionDefinition[]>productjson.webBuiltInExtensions || [])]) {
        await (async (extension: IExtensionDefinition): Promise<void> => {
            console.log(`${extension.name}@${extension.version}`);
            const results = await Promise.all(["package.json", "package-lock.json"].map(getContent));
            for (const result of results) {
                if (result.body) {
                    const extensionFolder = path.join(path.join(path.dirname(path.dirname(__dirname)), "extensionsCG"), extension.name);
                    fs.mkdirSync(extensionFolder, { recursive: true });
                    fs.writeFileSync(path.join(extensionFolder, result.fileName), result.body);
                    console.log(`  - ${result.fileName} ${ansiColors.green("✔︎")}`);
                }
                else if (result.body === undefined) {
                    console.log(`  - ${result.fileName} ${ansiColors.yellow("⚠️")}`);
                }
                else {
                    console.log(`  - ${result.fileName} ${ansiColors.red("🛑")}`);
                }
            }
            // Validation
            if (!results.find((r) => r.fileName === "package.json")?.body) {
                // throw new Error(`The "package.json" file could not be found for the built-in extension - ${extensionLabel}`);
            }
            if (!results.find((r) => r.fileName === "package-lock.json")?.body) {
                // throw new Error(`The "package-lock.json" could not be found for the built-in extension - ${extensionLabel}`);
            }
        })(extension);
    }
})().then(() => {
    console.log(`Built-in extensions component data downloaded ${ansiColors.green("✔︎")}`);
    process.exit(0);
}, (err) => {
    console.log(`Built-in extensions component data could not be downloaded ${ansiColors.red("🛑")}`);
    console.error(err);
    process.exit(1);
});
