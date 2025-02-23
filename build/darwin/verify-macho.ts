/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from "assert";
import { open, readdir, realpath, stat } from "fs/promises";
import path from "path";
import { ExitCodeError, spawn } from "@malept/cross-spawn-promise";
const MACHO_ARM64_CPU_TYPE = new Set([0x0c000001, 0x0100000c]);
const MACHO_X86_64_CPU_TYPE = new Set([0x07000001, 0x01000007]);
async function read(file: string, buf: Buffer, offset: number, length: number, position: number) {
    let filehandle;
    try {
        filehandle = await open(file);
        await filehandle.read(buf, offset, length, position);
    }
    finally {
        await filehandle?.close();
    }
}
const archToCheck = process.argv[2];
assert(process.env["APP_PATH"], "APP_PATH not set");
assert(archToCheck === "x64" ||
    archToCheck === "arm64" ||
    archToCheck === "universal", `Invalid architecture ${archToCheck} to check`);
(async (appPath: string, arch: string) => {
    const visited = new Set();
    const invalidFiles: string[] = [];
    const header = Buffer.alloc(8);
    const file_header_entry_size = 20;
    const traverse = async (p: string) => {
        p = await realpath(p);
        if (visited.has(p)) {
            return;
        }
        visited.add(p);
        const info = await stat(p);
        if (info.isSymbolicLink()) {
            return;
        }
        if (info.isFile()) {
            let fileOutput = "";
            try {
                fileOutput = await spawn("file", ["--brief", "--no-pad", p]);
            }
            catch (e) {
                if (e instanceof ExitCodeError) {
                    /* silently accept error codes from "file" */
                }
                else {
                    throw e;
                }
            }
            if (fileOutput.startsWith("Mach-O ")) {
                console.log(`Verifying architecture of ${p}`);
                read(p, header, 0, 8, 0).then((_) => {
                    const header_magic = header.readUInt32LE();
                    if (header_magic ===
                        0xfeedfacf) {
                        const cpu_type = header.readUInt32LE(4);
                        if ((arch === "universal")) {
                            invalidFiles.push(p);
                        }
                        else if ((arch === "arm64")
                            &&
                                !MACHO_ARM64_CPU_TYPE.has(cpu_type)) {
                            invalidFiles.push(p);
                        }
                        else if ((arch === "x64")
                            &&
                                !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
                            invalidFiles.push(p);
                        }
                    }
                    else if (header_magic ===
                        0xbebafeca) {
                        const num_binaries = header.readUInt32BE(4);
                        assert.equal(num_binaries, 2);
                        const file_entries_size = file_header_entry_size * num_binaries;
                        const file_entries = Buffer.alloc(file_entries_size);
                        read(p, file_entries, 0, file_entries_size, 8).then((_) => {
                            for (let i = 0; i < num_binaries; i++) {
                                const cpu_type = file_entries.readUInt32LE(file_header_entry_size * i);
                                if (!MACHO_ARM64_CPU_TYPE.has(cpu_type) &&
                                    !MACHO_X86_64_CPU_TYPE.has(cpu_type)) {
                                    invalidFiles.push(p);
                                }
                            }
                        });
                    }
                });
            }
        }
        if (info.isDirectory()) {
            for (const child of await readdir(p)) {
                await traverse(path.resolve(p, child));
            }
        }
    };
    await traverse(appPath);
    return invalidFiles;
})(process.env["APP_PATH"], archToCheck)
    .then((invalidFiles) => {
    if (invalidFiles.length > 0) {
        console.error("\x1b[31mThe following files are built for the wrong architecture:\x1b[0m");
        for (const file of invalidFiles) {
            console.error(`\x1b[31m${file}\x1b[0m`);
        }
        process.exit(1);
    }
    else {
        console.log("\x1b[32mAll files are valid\x1b[0m");
    }
})
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
