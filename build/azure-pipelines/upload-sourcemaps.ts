/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from "path";
import { ClientAssertionCredential } from "@azure/identity";
import es from "event-stream";
import Vinyl from "vinyl";
import vfs from "vinyl-fs";
import { getProductionDependencies } from "../lib/dependencies";
import * as util from "../lib/util";
const root = path.dirname(path.dirname(__dirname));
const credential = new ClientAssertionCredential(process.env["AZURE_TENANT_ID"]!, process.env["AZURE_CLIENT_ID"]!, () => Promise.resolve(process.env["AZURE_ID_TOKEN"]!));
// optionally allow to pass in explicit base/maps to upload
const [, , base, maps] = process.argv;
function src(base: string, maps = `${base}/**/*.map`) {
    return vfs.src(maps, { base }).pipe(es.mapSync((f: Vinyl) => {
        f.path = `${f.base}/core/${f.relative}`;
        return f;
    }));
}
((): Promise<void> => {
    const sources: any[] = [];
    // vscode client maps (default)
    if (!base) {
        sources.push(src("out-vscode-min"));
        sources.push(vfs
            .src(getProductionDependencies(root).map((d: string) => path.relative(root, d))
            .map((d: string) => `./${d}/**/*.map`), { base: "." })
            .pipe(util.cleanNodeModules(path.join(root, "build", ".moduleignore")))
            .pipe(util.cleanNodeModules(path.join(root, "build", `.moduleignore.${process.platform}`))));
        sources.push(vfs.src([".build/extensions/**/*.js.map", "!**/node_modules/**"], { base: ".build" }));
    }
    // specific client base/maps
    else {
        sources.push(src(base, maps));
    }
    return new Promise((c, e) => {
        es.merge(...sources)
            .pipe(es.through(function (data: Vinyl) {
            console.log("Uploading Sourcemap", data.relative); // debug
            this.emit("data", data);
        }))
            .pipe(require("gulp-azure-storage").upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: "sourcemaps",
            prefix: process.env["BUILD_SOURCEVERSION"]
                + "/",
        }))
            .on("end", () => c())
            .on("error", (err: any) => e(err));
    });
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
