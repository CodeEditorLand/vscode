/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
import ansiColors from "ansi-colors";
import es from "event-stream";
import fancyLog from "fancy-log";
class ErrorLog {
    constructor(public id: string) { }
    allErrors: string[][] = [];
    startTime: number | null = null;
    count = 0;
    onStart(): void {
        if (this.count++ > 0) {
            return;
        }
        this.startTime = new Date().getTime();
        fancyLog(`Starting ${ansiColors.green("compilation")}${this.id ? ansiColors.blue(` ${this.id}`) : ""}...`);
    }
    onEnd(): void {
        if (--this.count > 0) {
            return;
        }
        this.log();
    }
    log(): void {
        const errors = this.allErrors.flat();
        const seen = new Set<string>();
        errors.map((err) => {
            if (!seen.has(err)) {
                seen.add(err);
                fancyLog(`${ansiColors.red("Error")}: ${err}`);
            }
        });
        fancyLog(`Finished ${ansiColors.green("compilation")}${this.id ? ansiColors.blue(` ${this.id}`) : ""} with ${errors.length} errors after ${ansiColors.magenta(new Date().getTime() - this.startTime! + " ms")}`);
        try {
            fs.writeFileSync(path.join(path.join(path.dirname(path.dirname(__dirname)), ".build"), ("log" + (this.id ? `_${this.id}` : ""))), JSON.stringify(errors
                .map((err) => /^([^(]+)\((\d+),(\d+)\): (.*)$/s.exec(err))
                .filter((match) => !!match)
                .map((x) => x as string[])
                .map(([, path, line, column, message]) => ({
                path,
                line: parseInt(line),
                column: parseInt(column),
                message,
            }))));
        }
        catch (err) {
            //noop
        }
    }
}
const errorLogsById = new Map<string, ErrorLog>();
try {
    fs.mkdirSync(path.join(path.dirname(path.dirname(__dirname)), ".build"));
}
catch (err) {
    // ignore
}
export interface IReporter {
    (err: string): void;
    hasErrors(): boolean;
    end(emitError: boolean): NodeJS.ReadWriteStream;
}
export function createReporter(id?: string): IReporter {
    const errorLog = ((id: string = "") => {
        let errorLog = errorLogsById.get(id);
        if (!errorLog) {
            errorLog = new ErrorLog(id);
            errorLogsById.set(id, errorLog);
        }
        return errorLog;
    })(id);
    const errors: string[] = [];
    errorLog.allErrors.push(errors);
    const result = (err: string) => errors.push(err);
    result.hasErrors = () => errors.length > 0;
    result.end = (emitError: boolean): NodeJS.ReadWriteStream => {
        errors.length = 0;
        errorLog.onStart();
        return es.through(undefined, function () {
            errorLog.onEnd();
            if (emitError && errors.length > 0) {
                if (!(errors as any).__logged__) {
                    errorLog.log();
                }
                (errors as any).__logged__ = true;
                const err = new Error(`Found ${errors.length} errors`);
                (err as any).__reporter__ = true;
                this.emit("error", err);
            }
            else {
                this.emit("end");
            }
        });
    };
    return result;
}
