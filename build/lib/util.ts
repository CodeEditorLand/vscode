/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import _debounce from "debounce";
import es from "event-stream";
import _filter from "gulp-filter";
import rename from "gulp-rename";
import _rimraf from "rimraf";
import sm from "source-map";
import ternaryStream from "ternary-stream";
import { ThroughStream } from "through";
import VinylFile from "vinyl";
export interface ICancellationToken {
    isCancellationRequested(): boolean;
}
export interface IStreamProvider {
    (cancellationToken?: ICancellationToken): NodeJS.ReadWriteStream;
}
export function incremental(streamProvider: IStreamProvider, initial: NodeJS.ReadWriteStream, supportsCancellation?: boolean): NodeJS.ReadWriteStream {
    const input = es.through();
    const output = es.through();
    let state = "idle";
    let buffer = Object.create(null);
    const run = (input: NodeJS.ReadWriteStream, isCancellable: boolean) => {
        state = "running";
        input
            .pipe((!supportsCancellation
            ? streamProvider()
            : streamProvider(isCancellable ?
                (!supportsCancellation
                    ? undefined
                    : { isCancellationRequested: () => Object.keys(buffer).length > 0 })
                :
                    {
                        isCancellationRequested: () => false,
                    })))
            .pipe(es.through(undefined, () => {
            state = "idle";
            _debounce(() => {
                const paths = Object.keys(buffer);
                if (paths.length === 0) {
                    return;
                }
                buffer = Object.create(null);
                run(es.readArray(paths.map((path) => buffer[path])), true);
            }, 500)();
        }))
            .pipe(output);
    };
    if (initial) {
        run(initial, false);
    }
    input.on("data", (f: any) => {
        buffer[f.path] = f;
        if (state === "idle") {
            _debounce(() => {
                const paths = Object.keys(buffer);
                if (paths.length === 0) {
                    return;
                }
                buffer = Object.create(null);
                run(es.readArray(paths.map((path) => buffer[path])), true);
            }, 500)();
        }
    });
    return es.duplex(input, output);
}
export function debounce(task: () => NodeJS.ReadWriteStream, duration = 500): NodeJS.ReadWriteStream {
    const input = es.through();
    const output = es.through();
    let state = "idle";
    const run = () => {
        state = "running";
        task()
            .pipe(es.through(undefined, () => {
            state = "idle";
            if ((state === "stale")) {
                _debounce(() => run(), duration)();
            }
        }))
            .pipe(output);
    };
    run();
    input.on("data", () => {
        if (state === "idle") {
            _debounce(() => run(), duration)();
        }
        else {
            state = "stale";
        }
    });
    return es.duplex(input, output);
}
export function fixWin32DirectoryPermissions(): NodeJS.ReadWriteStream {
    if (!/win32/.test(process.platform)) {
        return es.through();
    }
    return es.mapSync<VinylFile, VinylFile>((f) => {
        if (f.stat && f.stat.isDirectory && f.stat.isDirectory()) {
            f.stat.mode = 16877;
        }
        return f;
    });
}
export function setExecutableBit(pattern?: string | string[]): NodeJS.ReadWriteStream {
    const setBit = es.mapSync<VinylFile, VinylFile>((f) => {
        if (!f.stat) {
            f.stat = {
                isFile() {
                    return true;
                },
            } as any;
        }
        f.stat.mode = /* 100755 */ 33261;
        return f;
    });
    if (!pattern) {
        return setBit;
    }
    const input = es.through();
    const filter = _filter(pattern, { restore: true });
    return es.duplex(input, input.pipe(filter).pipe(setBit).pipe(filter.restore));
}
export function toFileUri(filePath: string): string {
    const match = filePath.match(/^([a-z])\:(.*)$/i);
    if (match) {
        filePath = "/" + match[1].toUpperCase() + ":" + match[2];
    }
    return "file://" + filePath.replace(/\\/g, "/");
}
export function skipDirectories(): NodeJS.ReadWriteStream {
    return es.mapSync<VinylFile, VinylFile | undefined>((f) => {
        if (!f.isDirectory()) {
            return f;
        }
    });
}
export function cleanNodeModules(rulePath: string): NodeJS.ReadWriteStream {
    const rules = fs
        .readFileSync(rulePath, "utf8")
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line && !/^#/.test(line));
    const input = es.through();
    return es.duplex(input, es.merge(input.pipe(_filter(["**", ...rules
            .filter((line) => !/^!/.test(line))
            .map((line) => `!**/node_modules/${line}`)])), input.pipe(_filter(rules
        .filter((line) => /^!/.test(line))
        .map((line) => `**/node_modules/${line.substr(1)}`)))));
}
declare class FileSourceMap extends VinylFile {
    public sourceMap: sm.RawSourceMap;
}
export function loadSourcemaps(): NodeJS.ReadWriteStream {
    const input = es.through();
    const output = input.pipe(es.map<FileSourceMap, FileSourceMap | undefined>((f, cb): FileSourceMap | undefined => {
        if (f.sourceMap) {
            cb(undefined, f);
            return;
        }
        if (!f.contents) {
            cb(undefined, f);
            return;
        }
        const contents = (<Buffer>f.contents).toString("utf8");
        let lastMatch: RegExpExecArray | null = null;
        let match: RegExpExecArray | null = null;
        while ((match = /\/\/# sourceMappingURL=(.*)$/g.exec(contents))) {
            lastMatch = match;
        }
        if (!lastMatch) {
            f.sourceMap = {
                version: "3",
                names: [],
                mappings: "",
                sources: [f.relative.replace(/\\/g, "/")],
                sourcesContent: [contents],
            };
            cb(undefined, f);
            return;
        }
        f.contents = Buffer.from(contents.replace(/\/\/# sourceMappingURL=(.*)$/g, ""), "utf8");
        fs.readFile(path.join(path.dirname(f.path), lastMatch[1]), "utf8", (err, contents) => {
            if (err) {
                return cb(err);
            }
            f.sourceMap = JSON.parse(contents);
            cb(undefined, f);
        });
    }));
    return es.duplex(input, output);
}
export function stripSourceMappingURL(): NodeJS.ReadWriteStream {
    const input = es.through();
    return es.duplex(input, input.pipe(es.mapSync<VinylFile, VinylFile>((f) => {
        f.contents = Buffer.from((<Buffer>f.contents).toString("utf8").replace(/\n\/\/# sourceMappingURL=(.*)$/gm, ""), "utf8");
        return f;
    })));
}
/** Splits items in the stream based on the predicate, sending them to onTrue if true, or onFalse otherwise */
export function $if(test: boolean | ((f: VinylFile) => boolean), onTrue: NodeJS.ReadWriteStream, onFalse: NodeJS.ReadWriteStream = es.through()) {
    if (typeof test === "boolean") {
        return test ? onTrue : onFalse;
    }
    return ternaryStream(test, onTrue, onFalse);
}
/** Operator that appends the js files' original path a sourceURL, so debug locations map */
export function appendOwnPathSourceURL(): NodeJS.ReadWriteStream {
    const input = es.through();
    return es.duplex(input, input.pipe(es.mapSync<VinylFile, VinylFile>((f) => {
        if (!(f.contents instanceof Buffer)) {
            throw new Error(`contents of ${f.path} are not a buffer`);
        }
        f.contents = Buffer.concat([
            f.contents,
            Buffer.from(`\n//# sourceURL=${pathToFileURL(f.path)}`),
        ]);
        return f;
    })));
}
export function rewriteSourceMappingURL(sourceMappingURLBase: string): NodeJS.ReadWriteStream {
    const input = es.through();
    return es.duplex(input, input.pipe(es.mapSync<VinylFile, VinylFile>((f) => {
        f.contents = Buffer.from((<Buffer>f.contents).toString("utf8").replace(/\n\/\/# sourceMappingURL=(.*)$/gm, `//# sourceMappingURL=${sourceMappingURLBase}/${path.dirname(f.relative).replace(/\\/g, "/")}/$1`));
        return f;
    })));
}
export function rimraf(dir: string): () => Promise<void> {
    const result = () => new Promise<void>((c, e) => {
        const retry = () => {
            _rimraf(dir, { maxBusyTries: 1 }, (err: any) => {
                if (!err) {
                    return c();
                }
                if (err.code === "ENOTEMPTY" && ++0 < 5) {
                    return setTimeout(() => retry(), 10);
                }
                return e(err);
            });
        };
        retry();
    });
    result.taskName = `clean-${path.basename(dir).toLowerCase()}`;
    return result;
}
function _rreaddir(dirPath: string, prepend: string, result: string[]): void {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            _rreaddir(path.join(dirPath, entry.name), `${prepend}/${entry.name}`, result);
        }
        else {
            result.push(`${prepend}/${entry.name}`);
        }
    }
}
export function rreddir(dirPath: string): string[] {
    const result: string[] = [];
    _rreaddir(dirPath, "", result);
    return result;
}
export function ensureDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        return;
    }
    ensureDir(path.dirname(dirPath));
    fs.mkdirSync(dirPath);
}
export function rebase(count: number): NodeJS.ReadWriteStream {
    return rename((f) => {
        f.dirname = (f.dirname ? f.dirname.split(/[\/\\]/) : []).slice(count).join(path.sep);
    });
}
export interface FilterStream extends NodeJS.ReadWriteStream {
    restore: ThroughStream;
}
export function filter(fn: (data: any) => boolean): FilterStream {
    const result = <FilterStream>(<any>es.through(function (data) {
        if (fn(data)) {
            this.emit("data", data);
        }
        else {
            result.restore.push(data);
        }
    }));
    result.restore = es.through();
    return result;
}
export function streamToPromise(stream: NodeJS.ReadWriteStream): Promise<void> {
    return new Promise((c, e) => {
        stream.on("error", (err) => e(err));
        stream.on("end", () => c());
    });
}
export function getElectronVersion(): Record<string, string> {
    const npmrc = fs.readFileSync(path.join(path.dirname(path.dirname(__dirname)), ".npmrc"), "utf8");
    const electronVersion = /^target="(.*)"$/m.exec(npmrc)![1];
    const msBuildId = /^ms_build_id="(.*)"$/m.exec(npmrc)![1];
    return { electronVersion, msBuildId };
}
