/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from "path";
import es from "event-stream";
import minimatch from "minimatch";
import VinylFile from "vinyl";
const pickle = require("chromium-pickle-js");
declare class AsarFilesystem {
    readonly header: unknown;
    constructor(src: string);
    insertDirectory(path: string, shouldUnpack?: boolean): unknown;
    insertFile(path: string, shouldUnpack: boolean, file: {
        stat: {
            size: number;
            mode: number;
        };
    }, options: {}): Promise<void>;
}
export function createAsar(folderPath: string, unpackGlobs: string[], skipGlobs: string[], duplicateGlobs: string[], destFilename: string): NodeJS.ReadWriteStream {
    const filesystem = new (<typeof AsarFilesystem>require("asar/lib/filesystem"))(folderPath);
    const out: Buffer[] = [];
    // Keep track of pending inserts
    let pendingInserts = 0;
    let onFileInserted = () => {
        pendingInserts--;
    };
    // Do not insert twice the same directory
    const seenDir: {
        [key: string]: boolean;
    } = {};
    const insertDirectoryRecursive = (dir: string) => {
        if (seenDir[dir]) {
            return;
        }
        let lastSlash = dir.lastIndexOf("/");
        if (lastSlash === -1) {
            lastSlash = dir.lastIndexOf("\\");
        }
        if (lastSlash !== -1) {
            insertDirectoryRecursive(dir.substring(0, lastSlash));
        }
        seenDir[dir] = true;
        filesystem.insertDirectory(dir);
    };
    return es.through(function (file) {
        if (file.stat.isDirectory()) {
            return;
        }
        if (!file.stat.isFile()) {
            throw new Error(`unknown item in stream!`);
        }
        if (((file: VinylFile): boolean => {
            for (const skipGlob of skipGlobs) {
                if (minimatch(file.relative, skipGlob)) {
                    return true;
                }
            }
            return false;
        })(file)) {
            this.queue(new VinylFile({
                base: ".",
                path: file.path,
                stat: file.stat,
                contents: file.contents,
            }));
            return;
        }
        if (((file: VinylFile): boolean => {
            for (const duplicateGlob of duplicateGlobs) {
                if (minimatch(file.relative, duplicateGlob)) {
                    return true;
                }
            }
            return false;
        })(file)) {
            this.queue(new VinylFile({
                base: ".",
                path: file.path,
                stat: file.stat,
                contents: file.contents,
            }));
        }
        const shouldUnpack = ((file: VinylFile): boolean => {
            for (let i = 0; i < unpackGlobs.length; i++) {
                if (minimatch(file.relative, unpackGlobs[i])) {
                    return true;
                }
            }
            return false;
        })(file);
        ((relativePath: string, stat: {
            size: number;
            mode: number;
        }, shouldUnpack: boolean) => {
            ((file: string) => {
                let lastSlash = file.lastIndexOf("/");
                if (lastSlash === -1) {
                    lastSlash = file.lastIndexOf("\\");
                }
                if (lastSlash !== -1) {
                    insertDirectoryRecursive(file.substring(0, lastSlash));
                }
            })(relativePath);
            pendingInserts++;
            // Do not pass `onFileInserted` directly because it gets overwritten below.
            // Create a closure capturing `onFileInserted`.
            filesystem
                .insertFile(relativePath, shouldUnpack, { stat: stat }, {})
                .then(() => onFileInserted(), () => onFileInserted());
        })(file.relative, { size: file.contents.length, mode: file.stat.mode }, shouldUnpack);
        if (shouldUnpack) {
            this.queue(new VinylFile({
                base: ".",
                path: path.join(destFilename + ".unpacked", path.relative(folderPath, file.path)),
                stat: file.stat,
                contents: file.contents,
            }));
        }
        else {
            // The file goes inside of xx.asar
            out.push(file.contents);
        }
    }, function () {
        const finish = () => {
            {
                const headerPickle = pickle.createEmpty();
                headerPickle.writeString(JSON.stringify(filesystem.header));
                const headerBuf = headerPickle.toBuffer();
                const sizePickle = pickle.createEmpty();
                sizePickle.writeUInt32(headerBuf.length);
                out.unshift(headerBuf);
                out.unshift(sizePickle.toBuffer());
            }
            out.length = 0;
            this.queue(new VinylFile({
                base: ".",
                path: destFilename,
                contents: Buffer.concat(out),
            }));
            this.queue(null);
        };
        // Call finish() only when all file inserts have finished...
        if (pendingInserts === 0) {
            finish();
        }
        else {
            onFileInserted = () => {
                pendingInserts--;
                if (pendingInserts === 0) {
                    finish();
                }
            };
        }
    });
}
