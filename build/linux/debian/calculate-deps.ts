/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { spawnSync } from "child_process";
import { constants, statSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import manifests from "../../../cgmanifest.json";
import { additionalDeps } from "./dep-lists";
import { DebianArchString } from "./types";
export function generatePackageDeps(files: string[], arch: DebianArchString, chromiumSysroot: string, vscodeSysroot: string): Set<string>[] {
    const dependencies: Set<string>[] = files.map((file) => calculatePackageDeps(file, arch, chromiumSysroot, vscodeSysroot));
    dependencies.push(new Set(additionalDeps));
    return dependencies;
}
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/debian/calculate_package_deps.py.
function calculatePackageDeps(binaryPath: string, arch: DebianArchString, chromiumSysroot: string, vscodeSysroot: string): Set<string> {
    try {
        if (!(statSync(binaryPath).mode & constants.S_IXUSR)) {
            throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
        }
    }
    catch (e) {
        // The package might not exist. Don't re-throw the error here.
        console.error("Tried to stat " + binaryPath + " but failed.");
    }
    const dpkgShlibdepsScriptLocation = `${tmpdir()}/dpkg-shlibdeps.pl`;
    const result = spawnSync("curl", [
        `https://raw.githubusercontent.com/chromium/chromium/${manifests.registrations.filter((registration) => {
            return (registration.component.type === "git" &&
                registration.component.git!.name === "chromium");
        })[0].version}/third_party/dpkg-shlibdeps/dpkg-shlibdeps.pl`,
        "-o",
        dpkgShlibdepsScriptLocation,
    ]);
    if (result.status !== 0) {
        throw new Error("Cannot retrieve dpkg-shlibdeps. Stderr:\n" + result.stderr);
    }
    const cmd = [dpkgShlibdepsScriptLocation, "--ignore-weak-undefined"];
    switch (arch) {
        case "amd64":
            cmd.push(`-l${chromiumSysroot}/usr/lib/x86_64-linux-gnu`, `-l${chromiumSysroot}/lib/x86_64-linux-gnu`, `-l${vscodeSysroot}/usr/lib/x86_64-linux-gnu`, `-l${vscodeSysroot}/lib/x86_64-linux-gnu`);
            break;
        case "armhf":
            cmd.push(`-l${chromiumSysroot}/usr/lib/arm-linux-gnueabihf`, `-l${chromiumSysroot}/lib/arm-linux-gnueabihf`, `-l${vscodeSysroot}/usr/lib/arm-linux-gnueabihf`, `-l${vscodeSysroot}/lib/arm-linux-gnueabihf`);
            break;
        case "arm64":
            cmd.push(`-l${chromiumSysroot}/usr/lib/aarch64-linux-gnu`, `-l${chromiumSysroot}/lib/aarch64-linux-gnu`, `-l${vscodeSysroot}/usr/lib/aarch64-linux-gnu`, `-l${vscodeSysroot}/lib/aarch64-linux-gnu`);
            break;
    }
    cmd.push(`-l${chromiumSysroot}/usr/lib`);
    cmd.push(`-L${vscodeSysroot}/debian/libxkbfile1/DEBIAN/shlibs`);
    cmd.push("-O", "-e", path.resolve(binaryPath));
    const dpkgShlibdepsResult = spawnSync("perl", cmd, {
        cwd: chromiumSysroot,
    });
    if (dpkgShlibdepsResult.status !== 0) {
        throw new Error(`dpkg-shlibdeps failed with exit code ${dpkgShlibdepsResult.status}. stderr:\n${dpkgShlibdepsResult.stderr} `);
    }
    const shlibsDependsPrefix = "shlibs:Depends=";
    let depsStr = "";
    for (const line of dpkgShlibdepsResult.stdout
        .toString("utf-8")
        .trimEnd()
        .split("\n")) {
        if (line.startsWith(shlibsDependsPrefix)) {
            depsStr = line.substring(shlibsDependsPrefix.length);
        }
    }
    return new Set(depsStr
        .split(", ")
        .filter((dependency) => {
        return !dependency.startsWith("libgcc-s1");
    })
        .sort());
}
