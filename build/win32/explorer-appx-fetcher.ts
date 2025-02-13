/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
import fs from "fs";
import path from "path";
import { downloadArtifact } from "@electron/get";
import debug from "debug";
import extract from "extract-zip";
const d = debug("explorer-appx-fetcher");
export async function downloadExplorerAppx(outDir: string, quality: string = "stable", targetArch: string = "x64"): Promise<void> {
    const fileName = `${(quality === "insider" ? "code_insiders" : "code")}_explorer_${targetArch}.zip`;
    if (await fs.existsSync(path.resolve(outDir, "resources.pri"))) {
        return;
    }
    if (!(await fs.existsSync(outDir))) {
        await fs.mkdirSync(outDir, { recursive: true });
    }
    d(`downloading ${fileName}`);
    d(`unpacking from ${fileName}`);
    await extract(await downloadArtifact({
        isGeneric: true,
        version: "3.0.4",
        artifactName: fileName,
        unsafelyDisableChecksums: true,
        mirrorOptions: {
            mirror: "https://github.com/microsoft/vscode-explorer-command/releases/download/",
            customDir: "3.0.4",
            customFilename: fileName,
        },
    }), { dir: fs.realpathSync(outDir) });
}
if (require.main === module) {
    (async (outputDir?: string): Promise<void> => {
        if (!outputDir) {
            throw new Error("Required build env not set");
        }
        await downloadExplorerAppx(outputDir, (JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(__dirname)), "product.json"), "utf8")) as any).quality, process.env["VSCODE_ARCH"]);
    })(process.argv[2]).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
