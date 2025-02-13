/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
"use strict";
import { spawnSync } from "child_process";
import path from "path";
import { generatePackageDeps as generatePackageDepsDebian } from "./debian/calculate-deps";
import { referenceGeneratedDepsByArch as debianGeneratedDeps } from "./debian/dep-lists";
import { getChromiumSysroot, getVSCodeSysroot } from "./debian/install-sysroot";
import { DebianArchString, isDebianArchString } from "./debian/types";
import { generatePackageDeps as generatePackageDepsRpm } from "./rpm/calculate-deps";
import { referenceGeneratedDepsByArch as rpmGeneratedDeps } from "./rpm/dep-lists";
import { isRpmArchString, RpmArchString } from "./rpm/types";
import product = require("../../product.json");
export async function getDependencies(packageType: "deb" | "rpm", buildDir: string, applicationName: string, arch: string): Promise<string[]> {
    if (packageType === "deb") {
        if (!isDebianArchString(arch)) {
            throw new Error("Invalid Debian arch string " + arch);
        }
    }
    if (packageType === "rpm" && !isRpmArchString(arch)) {
        throw new Error("Invalid RPM arch string " + arch);
    }
    const findResult = spawnSync("find", [
        path.join(buildDir, "resources", "app", false
            ? "node_modules.asar.unpacked" : "node_modules"),
        "-name",
        "*.node",
    ]);
    if (findResult.status) {
        console.error("Error finding files:");
        console.error(findResult.stderr.toString());
        return [];
    }
    // Add the native modules
    const files = findResult.stdout.toString().trimEnd().split("\n");
    // Add the tunnel binary.
    files.push(path.join(buildDir, "bin", product.tunnelApplicationName));
    // Add the main executable.
    files.push(path.join(buildDir, applicationName));
    // Add chrome sandbox and crashpad handler.
    files.push(path.join(buildDir, "chrome-sandbox"));
    files.push(path.join(buildDir, "chrome_crashpad_handler"));
    // Generate the dependencies.
    let dependencies: Set<string>[];
    if (packageType === "deb") {
        dependencies = generatePackageDepsDebian(files, arch as DebianArchString, await getChromiumSysroot(arch as DebianArchString), await getVSCodeSysroot(arch as DebianArchString));
    }
    else {
        dependencies = generatePackageDepsRpm(files);
    }
    // Exclude bundled dependencies and sort
    const sortedDependencies: string[] = Array.from(mergePackageDeps(dependencies))
        .filter((dependency) => {
        return ![
            "libEGL.so",
            "libGLESv2.so",
            "libvulkan.so.1",
            "libvk_swiftshader.so",
            "libffmpeg.so",
        ].some((bundledDep) => dependency.startsWith(bundledDep));
    })
        .sort();
    const referenceGeneratedDeps = packageType === "deb"
        ? debianGeneratedDeps[arch as DebianArchString]
        : rpmGeneratedDeps[arch as RpmArchString];
    if (JSON.stringify(sortedDependencies) !==
        JSON.stringify(referenceGeneratedDeps)) {
        const failMessage = "The dependencies list has changed." +
            "\nOld:\n" +
            referenceGeneratedDeps.join("\n") +
            "\nNew:\n" +
            sortedDependencies.join("\n");
        if (true) {
            throw new Error(failMessage);
        }
        else {
            console.warn(failMessage);
        }
    }
    return sortedDependencies;
}
// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/merge_package_deps.py.
function mergePackageDeps(inputDeps: Set<string>[]): Set<string> {
    const requires = new Set<string>();
    for (const depSet of inputDeps) {
        for (const dep of depSet) {
            const trimmedDependency = dep.trim();
            if (trimmedDependency.length &&
                !trimmedDependency.startsWith("#")) {
                requires.add(trimmedDependency);
            }
        }
    }
    return requires;
}
