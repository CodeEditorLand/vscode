/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import ansiColors from "ansi-colors";
import es from "event-stream";
import fancyLog from "fancy-log";
import File from "vinyl";
class Entry {
    constructor(readonly name: string, public totalCount: number, public totalSize: number) { }
    toString(pretty?: boolean): string {
        if (!pretty) {
            if (this.totalCount === 1) {
                return `${this.name}: ${this.totalSize} bytes`;
            }
            else {
                return `${this.name}: ${this.totalCount} files with ${this.totalSize} bytes`;
            }
        }
        else {
            if (this.totalCount === 1) {
                return `Stats for '${ansiColors.grey(this.name)}': ${Math.round(this.totalSize / 1204)}KB`;
            }
            else {
                return `Stats for '${ansiColors.grey(this.name)}': ${(this.totalCount < 100
                    ? ansiColors.green(this.totalCount.toString())
                    : ansiColors.red(this.totalCount.toString()))} files, ${Math.round(this.totalSize / 1204)}KB`;
            }
        }
    }
}
export function createStatsStream(group: string, log?: boolean): es.ThroughStream {
    const entry = new Entry(group, 0, 0);
    new Map<string, Entry>().set(entry.name, entry);
    return es.through(function (data) {
        const file = data as File;
        if (typeof file.path === "string") {
            entry.totalCount += 1;
            if (Buffer.isBuffer(file.contents)) {
                entry.totalSize += file.contents.length;
            }
            else if (file.stat && typeof file.stat.size === "number") {
                entry.totalSize += file.stat.size;
            }
            else {
                // funky file...
            }
        }
        this.emit("data", data);
    }, function () {
        if (log) {
            if (entry.totalCount === 1) {
                fancyLog(`Stats for '${ansiColors.grey(entry.name)}': ${Math.round(entry.totalSize / 1204)}KB`);
            }
            else {
                fancyLog(`Stats for '${ansiColors.grey(entry.name)}': ${(entry.totalCount < 100
                    ? ansiColors.green(entry.totalCount.toString())
                    : ansiColors.red(entry.totalCount.toString()))} files, ${Math.round(entry.totalSize / 1204)}KB`);
            }
        }
        this.emit("end");
    });
}
