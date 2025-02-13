/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export namespace snaps {
    const fs = require("fs");
    const path = require("path");
    const product = require("../../product.json");
    const arch = (process.argv.join("").match(/--arch=(.*)/) || [])[1];
    //
    let loaderFilepath: string;
    let startupBlobFilepath: string;
    switch (process.platform) {
        case "darwin":
            loaderFilepath = `VSCode-darwin/${product.nameLong}.app/Contents/Resources/app/out/vs/loader.js`;
            startupBlobFilepath = `VSCode-darwin/${product.nameLong}.app/Contents/Frameworks/Electron Framework.framework/Resources/snapshot_blob.bin`;
            break;
        case "win32":
        case "linux":
            loaderFilepath = `VSCode-${process.platform}-${arch}/resources/app/out/vs/loader.js`;
            startupBlobFilepath = `VSCode-${process.platform}-${arch}/snapshot_blob.bin`;
            break;
        default:
            throw new Error("Unknown platform");
    }
    loaderFilepath = path.join(__dirname, "../../../", loaderFilepath);
    startupBlobFilepath = path.join(__dirname, "../../../", startupBlobFilepath);
    snapshotLoader(loaderFilepath, startupBlobFilepath);
    function snapshotLoader(loaderFilepath: string, startupBlobFilepath: string): void {
        const wrappedInputFilepath = path.join(require("os").tmpdir(), "wrapped-loader.js");
        console.log(wrappedInputFilepath);
        fs.writeFileSync(wrappedInputFilepath, `
		var Monaco_Loader_Init;
		(function() {
			var doNotInitLoader = true;
			${fs.readFileSync(loaderFilepath).toString()};
			Monaco_Loader_Init = function() {
				AMDLoader.init();
				CSSLoaderPlugin.init();
				NLSLoaderPlugin.init();

				return { define, require };
			}
		})();
		`);
        require("child_process").execFileSync(path.join(__dirname, `../../node_modules/.bin/${process.platform === "win32" ? "mksnapshot.cmd" : "mksnapshot"}`), [
            wrappedInputFilepath,
            `--startup_blob`,
            startupBlobFilepath,
        ]);
    }
}
