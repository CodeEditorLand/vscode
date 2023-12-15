/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import { tmpdir } from "os";
import { promisify } from "util";
import { ResourceQueue, timeout } from "vs/base/common/async";
import {
	isEqualOrParent,
	isRootOrDriveLetter,
	randomPath,
} from "vs/base/common/extpath";
import { normalizeNFC } from "vs/base/common/normalization";
import { join } from "vs/base/common/path";
import { isLinux, isMacintosh, isWindows } from "vs/base/common/platform";
import { extUriBiasedIgnorePathCase } from "vs/base/common/resources";
import { URI } from "vs/base/common/uri";

//#region rimraf

export enum RimRafMode {
	/**
	 * Slow version that unlinks each file and folder.
	 */
	UNLINK,

	/**
	 * Fast version that first moves the file/folder
	 * into a temp directory and then deletes that
	 * without waiting for it.
	 */
	MOVE,
}

/**
 * Allows to delete the provided path (either file or folder) recursively
 * with the options:
 * - `UNLINK`: direct removal from disk
 * - `MOVE`: faster variant that first moves the target to temp dir and then
 *           deletes it in the background without waiting for that to finish.
 *           the optional `moveToPath` allows to override where to rename the
 *           path to before deleting it.
 */
async function rimraf(path: string, mode: RimRafMode.UNLINK): Promise<void>;
async function rimraf(
	path: string,
	mode: RimRafMode.MOVE,
	moveToPath?: string,
): Promise<void>;
async function rimraf(
	path: string,
	mode?: RimRafMode,
	moveToPath?: string,
): Promise<void>;
async function rimraf(
	path: string,
	mode = RimRafMode.UNLINK,
	moveToPath?: string,
): Promise<void> {
	if (isRootOrDriveLetter(path)) {
		throw new Error("rimraf - will refuse to recursively delete root");
	}

	// delete: via rm
	if (mode === RimRafMode.UNLINK) {
		return rimrafUnlink(path);
	}

	// delete: via move
	return rimrafMove(path, moveToPath);
}

async function rimrafMove(
	path: string,
	moveToPath = randomPath(tmpdir()),
): Promise<void> {
	try {
		try {
			// Intentionally using `fs.promises` here to skip
			// the patched graceful-fs method that can result
			// in very long running `rename` calls when the
			// folder is locked by a file watcher. We do not
			// really want to slow down this operation more
			// than necessary and we have a fallback to delete
			// via unlink.
			// https://github.com/microsoft/vscode/issues/139908
			await fs.promises.rename(path, moveToPath);
		} catch (error) {
			if (error.code === "ENOENT") {
				return; // ignore - path to delete did not exist
			}

			return rimrafUnlink(path); // otherwise fallback to unlink
		}

		// Delete but do not return as promise
		rimrafUnlink(moveToPath).catch((error) => {
			/* ignore */
		});
	} catch (error) {
		if (error.code !== "ENOENT") {
			throw error;
		}
	}
}

async function rimrafUnlink(path: string): Promise<void> {
	return promisify(fs.rm)(path, {
		recursive: true,
		force: true,
		maxRetries: 3,
	});
}

export function rimrafSync(path: string): void {
	if (isRootOrDriveLetter(path)) {
		throw new Error("rimraf - will refuse to recursively delete root");
	}

	fs.rmSync(path, { recursive: true, force: true, maxRetries: 3 });
}

//#endregion

//#region readdir with NFC support (macos)

export interface IDirent {
	name: string;

	isFile(): boolean;
	isDirectory(): boolean;
	isSymbolicLink(): boolean;
}

/**
 * Drop-in replacement of `fs.readdir` with support
 * for converting from macOS NFD unicon form to NFC
 * (https://github.com/nodejs/node/issues/2165)
 */
async function readdir(path: string): Promise<string[]>;
async function readdir(
	path: string,
	options: { withFileTypes: true },
): Promise<IDirent[]>;
async function readdir(
	path: string,
	options?: { withFileTypes: true },
): Promise<(string | IDirent)[]> {
	return handleDirectoryChildren(
		await (options
			? safeReaddirWithFileTypes(path)
			: promisify(fs.readdir)(path)),
	);
}

async function safeReaddirWithFileTypes(path: string): Promise<IDirent[]> {
	try {
		return await promisify(fs.readdir)(path, { withFileTypes: true });
	} catch (error) {
		console.warn(
			"[node.js fs] readdir with filetypes failed with error: ",
			error,
		);
	}

	// Fallback to manually reading and resolving each
	// children of the folder in case we hit an error
	// previously.
	// This can only really happen on exotic file systems
	// such as explained in #115645 where we get entries
	// from `readdir` that we can later not `lstat`.
	const result: IDirent[] = [];
	const children = await readdir(path);
	for (const child of children) {
		let isFile = false;
		let isDirectory = false;
		let isSymbolicLink = false;

		try {
			const lstat = await Promises.lstat(join(path, child));

			isFile = lstat.isFile();
			isDirectory = lstat.isDirectory();
			isSymbolicLink = lstat.isSymbolicLink();
		} catch (error) {
			console.warn(
				"[node.js fs] unexpected error from lstat after readdir: ",
				error,
			);
		}

		result.push({
			name: child,
			isFile: () => isFile,
			isDirectory: () => isDirectory,
			isSymbolicLink: () => isSymbolicLink,
		});
	}

	return result;
}

/**
 * Drop-in replacement of `fs.readdirSync` with support
 * for converting from macOS NFD unicon form to NFC
 * (https://github.com/nodejs/node/issues/2165)
 */
export function readdirSync(path: string): string[] {
	return handleDirectoryChildren(fs.readdirSync(path));
}

function handleDirectoryChildren(children: string[]): string[];
function handleDirectoryChildren(children: IDirent[]): IDirent[];
function handleDirectoryChildren(
	children: (string | IDirent)[],
): (string | IDirent)[];
function handleDirectoryChildren(
	children: (string | IDirent)[],
): (string | IDirent)[] {
	return children.map((child) => {
		// Mac: uses NFD unicode form on disk, but we want NFC
		// See also https://github.com/nodejs/node/issues/2165

		if (typeof child === "string") {
			return isMacintosh ? normalizeNFC(child) : child;
		}

		child.name = isMacintosh ? normalizeNFC(child.name) : child.name;

		return child;
	});
}

/**
 * A convenience method to read all children of a path that
 * are directories.
 */
async function readDirsInDir(dirPath: string): Promise<string[]> {
	const children = await readdir(dirPath);
	const directories: string[] = [];

	for (const child of children) {
		if (await SymlinkSupport.existsDirectory(join(dirPath, child))) {
			directories.push(child);
		}
	}

	return directories;
}

//#endregion

//#region whenDeleted()

/**
 * A `Promise` that resolves when the provided `path`
 * is deleted from disk.
 */
export function whenDeleted(path: string, intervalMs = 1000): Promise<void> {
	return new Promise<void>((resolve) => {
		let running = false;
		const interval = setInterval(() => {
			if (!running) {
				running = true;
				fs.access(path, (err) => {
					running = false;

					if (err) {
						clearInterval(interval);
						resolve(undefined);
					}
				});
			}
		}, intervalMs);
	});
}

//#endregion

//#region Methods with symbolic links support

export namespace SymlinkSupport {
	export interface IStats {
		// The stats of the file. If the file is a symbolic
		// link, the stats will be of that target file and
		// not the link itself.
		// If the file is a symbolic link pointing to a non
		// existing file, the stat will be of the link and
		// the `dangling` flag will indicate this.
		stat: fs.Stats;

		// Will be provided if the resource is a symbolic link
		// on disk. Use the `dangling` flag to find out if it
		// points to a resource that does not exist on disk.
		symbolicLink?: { dangling: boolean };
	}

	/**
	 * Resolves the `fs.Stats` of the provided path. If the path is a
	 * symbolic link, the `fs.Stats` will be from the target it points
	 * to. If the target does not exist, `dangling: true` will be returned
	 * as `symbolicLink` value.
	 */
	export async function stat(path: string): Promise<IStats> {
		// First stat the link
		let lstats: fs.Stats | undefined;
		try {
			lstats = await Promises.lstat(path);

			// Return early if the stat is not a symbolic link at all
			if (!lstats.isSymbolicLink()) {
				return { stat: lstats };
			}
		} catch (error) {
			/* ignore - use stat() instead */
		}

		// If the stat is a symbolic link or failed to stat, use fs.stat()
		// which for symbolic links will stat the target they point to
		try {
			const stats = await Promises.stat(path);

			return {
				stat: stats,
				symbolicLink: lstats?.isSymbolicLink()
					? { dangling: false }
					: undefined,
			};
		} catch (error) {
			// If the link points to a nonexistent file we still want
			// to return it as result while setting dangling: true flag
			if (error.code === "ENOENT" && lstats) {
				return { stat: lstats, symbolicLink: { dangling: true } };
			}

			// Windows: workaround a node.js bug where reparse points
			// are not supported (https://github.com/nodejs/node/issues/36790)
			if (isWindows && error.code === "EACCES") {
				try {
					const stats = await Promises.stat(
						await Promises.readlink(path),
					);

					return { stat: stats, symbolicLink: { dangling: false } };
				} catch (error) {
					// If the link points to a nonexistent file we still want
					// to return it as result while setting dangling: true flag
					if (error.code === "ENOENT" && lstats) {
						return {
							stat: lstats,
							symbolicLink: { dangling: true },
						};
					}

					throw error;
				}
			}

			throw error;
		}
	}

	/**
	 * Figures out if the `path` exists and is a file with support
	 * for symlinks.
	 *
	 * Note: this will return `false` for a symlink that exists on
	 * disk but is dangling (pointing to a nonexistent path).
	 *
	 * Use `exists` if you only care about the path existing on disk
	 * or not without support for symbolic links.
	 */
	export async function existsFile(path: string): Promise<boolean> {
		try {
			const { stat, symbolicLink } = await SymlinkSupport.stat(path);

			return stat.isFile() && symbolicLink?.dangling !== true;
		} catch (error) {
			// Ignore, path might not exist
		}

		return false;
	}

	/**
	 * Figures out if the `path` exists and is a directory with support for
	 * symlinks.
	 *
	 * Note: this will return `false` for a symlink that exists on
	 * disk but is dangling (pointing to a nonexistent path).
	 *
	 * Use `exists` if you only care about the path existing on disk
	 * or not without support for symbolic links.
	 */
	export async function existsDirectory(path: string): Promise<boolean> {
		try {
			const { stat, symbolicLink } = await SymlinkSupport.stat(path);

			return stat.isDirectory() && symbolicLink?.dangling !== true;
		} catch (error) {
			// Ignore, path might not exist
		}

		return false;
	}
}

//#endregion

//#region Write File

// According to node.js docs (https://nodejs.org/docs/v14.16.0/api/fs.html#fs_fs_writefile_file_data_options_callback)
// it is not safe to call writeFile() on the same path multiple times without waiting for the callback to return.
// Therefor we use a Queue on the path that is given to us to sequentialize calls to the same path properly.
const writeQueues = new ResourceQueue();

/**
 * Same as `fs.writeFile` but with an additional call to
 * `fs.fdatasync` after writing to ensure changes are
 * flushed to disk.
 *
 * In addition, multiple writes to the same path are queued.
 */
function writeFile(
	path: string,
	data: string,
	options?: IWriteFileOptions,
): Promise<void>;
function writeFile(
	path: string,
	data: Buffer,
	options?: IWriteFileOptions,
): Promise<void>;
function writeFile(
	path: string,
	data: Uint8Array,
	options?: IWriteFileOptions,
): Promise<void>;
function writeFile(
	path: string,
	data: string | Buffer | Uint8Array,
	options?: IWriteFileOptions,
): Promise<void>;
function writeFile(
	path: string,
	data: string | Buffer | Uint8Array,
	options?: IWriteFileOptions,
): Promise<void> {
	return writeQueues
		.queueFor(URI.file(path), extUriBiasedIgnorePathCase)
		.queue(() => {
			const ensuredOptions = ensureWriteOptions(options);

			return new Promise((resolve, reject) =>
				doWriteFileAndFlush(path, data, ensuredOptions, (error) =>
					error ? reject(error) : resolve(),
				),
			);
		});
}

interface IWriteFileOptions {
	mode?: number;
	flag?: string;
}

interface IEnsuredWriteFileOptions extends IWriteFileOptions {
	mode: number;
	flag: string;
}

let canFlush = true;
export function configureFlushOnWrite(enabled: boolean): void {
	canFlush = enabled;
}

// Calls fs.writeFile() followed by a fs.sync() call to flush the changes to disk
// We do this in cases where we want to make sure the data is really on disk and
// not in some cache.
//
// See https://github.com/nodejs/node/blob/v5.10.0/lib/fs.js#L1194
function doWriteFileAndFlush(
	path: string,
	data: string | Buffer | Uint8Array,
	options: IEnsuredWriteFileOptions,
	callback: (error: Error | null) => void,
): void {
	if (!canFlush) {
		return fs.writeFile(
			path,
			data,
			{ mode: options.mode, flag: options.flag },
			callback,
		);
	}

	// Open the file with same flags and mode as fs.writeFile()
	fs.open(path, options.flag, options.mode, (openError, fd) => {
		if (openError) {
			return callback(openError);
		}

		// It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
		fs.writeFile(fd, data, (writeError) => {
			if (writeError) {
				return fs.close(fd, () => callback(writeError)); // still need to close the handle on error!
			}

			// Flush contents (not metadata) of the file to disk
			// https://github.com/microsoft/vscode/issues/9589
			fs.fdatasync(fd, (syncError: Error | null) => {
				// In some exotic setups it is well possible that node fails to sync
				// In that case we disable flushing and warn to the console
				if (syncError) {
					console.warn(
						"[node.js fs] fdatasync is now disabled for this session because it failed: ",
						syncError,
					);
					configureFlushOnWrite(false);
				}

				return fs.close(fd, (closeError) => callback(closeError));
			});
		});
	});
}

/**
 * Same as `fs.writeFileSync` but with an additional call to
 * `fs.fdatasyncSync` after writing to ensure changes are
 * flushed to disk.
 */
export function writeFileSync(
	path: string,
	data: string | Buffer,
	options?: IWriteFileOptions,
): void {
	const ensuredOptions = ensureWriteOptions(options);

	if (!canFlush) {
		return fs.writeFileSync(path, data, {
			mode: ensuredOptions.mode,
			flag: ensuredOptions.flag,
		});
	}

	// Open the file with same flags and mode as fs.writeFile()
	const fd = fs.openSync(path, ensuredOptions.flag, ensuredOptions.mode);

	try {
		// It is valid to pass a fd handle to fs.writeFile() and this will keep the handle open!
		fs.writeFileSync(fd, data);

		// Flush contents (not metadata) of the file to disk
		try {
			fs.fdatasyncSync(fd); // https://github.com/microsoft/vscode/issues/9589
		} catch (syncError) {
			console.warn(
				"[node.js fs] fdatasyncSync is now disabled for this session because it failed: ",
				syncError,
			);
			configureFlushOnWrite(false);
		}
	} finally {
		fs.closeSync(fd);
	}
}

function ensureWriteOptions(
	options?: IWriteFileOptions,
): IEnsuredWriteFileOptions {
	if (!options) {
		return { mode: 0o666 /* default node.js mode for files */, flag: "w" };
	}

	return {
		mode:
			typeof options.mode === "number"
				? options.mode
				: 0o666 /* default node.js mode for files */,
		flag: typeof options.flag === "string" ? options.flag : "w",
	};
}

//#endregion

//#region Move / Copy

/**
 * A drop-in replacement for `fs.rename` that:
 * - allows to move across multiple disks
 * - attempts to retry the operation for certain error codes on Windows
 */
async function rename(
	source: string,
	target: string,
	windowsRetryTimeout: number | false = 60000 /* matches graceful-fs */,
): Promise<void> {
	if (source === target) {
		return; // simulate node.js behaviour here and do a no-op if paths match
	}

	try {
		if (isWindows && typeof windowsRetryTimeout === "number") {
			// On Windows, a rename can fail when either source or target
			// is locked by AV software. We do leverage graceful-fs to iron
			// out these issues, however in case the target file exists,
			// graceful-fs will immediately return without retry for fs.rename().
			await renameWithRetry(
				source,
				target,
				Date.now(),
				windowsRetryTimeout,
			);
		} else {
			await promisify(fs.rename)(source, target);
		}
	} catch (error) {
		// In two cases we fallback to classic copy and delete:
		//
		// 1.) The EXDEV error indicates that source and target are on different devices
		// In this case, fallback to using a copy() operation as there is no way to
		// rename() between different devices.
		//
		// 2.) The user tries to rename a file/folder that ends with a dot. This is not
		// really possible to move then, at least on UNC devices.
		if (
			(source.toLowerCase() !== target.toLowerCase() &&
				error.code === "EXDEV") ||
			source.endsWith(".")
		) {
			await copy(source, target, {
				preserveSymlinks: false /* copying to another device */,
			});
			await rimraf(source, RimRafMode.MOVE);
		} else {
			throw error;
		}
	}
}

async function renameWithRetry(
	source: string,
	target: string,
	startTime: number,
	retryTimeout: number,
	attempt = 0,
): Promise<void> {
	try {
		return await promisify(fs.rename)(source, target);
	} catch (error) {
		if (
			error.code !== "EACCES" &&
			error.code !== "EPERM" &&
			error.code !== "EBUSY"
		) {
			throw error; // only for errors we think are temporary
		}

		if (Date.now() - startTime >= retryTimeout) {
			console.error(
				`[node.js fs] rename failed after ${attempt} retries with error: ${error}`,
			);

			throw error; // give up after configurable timeout
		}

		if (attempt === 0) {
			let abortRetry = false;
			try {
				const { stat } = await SymlinkSupport.stat(target);
				if (!stat.isFile()) {
					abortRetry = true; // if target is not a file, EPERM error may be raised and we should not attempt to retry
				}
			} catch (error) {
				// Ignore
			}

			if (abortRetry) {
				throw error;
			}
		}

		// Delay with incremental backoff up to 100ms
		await timeout(Math.min(100, attempt * 10));

		// Attempt again
		return renameWithRetry(
			source,
			target,
			startTime,
			retryTimeout,
			attempt + 1,
		);
	}
}

interface ICopyPayload {
	readonly root: { source: string; target: string };
	readonly options: { preserveSymlinks: boolean };
	readonly handledSourcePaths: Set<string>;
}

/**
 * Recursively copies all of `source` to `target`.
 *
 * The options `preserveSymlinks` configures how symbolic
 * links should be handled when encountered. Set to
 * `false` to not preserve them and `true` otherwise.
 */
async function copy(
	source: string,
	target: string,
	options: { preserveSymlinks: boolean },
): Promise<void> {
	return doCopy(source, target, {
		root: { source, target },
		options,
		handledSourcePaths: new Set<string>(),
	});
}

// When copying a file or folder, we want to preserve the mode
// it had and as such provide it when creating. However, modes
// can go beyond what we expect (see link below), so we mask it.
// (https://github.com/nodejs/node-v0.x-archive/issues/3045#issuecomment-4862588)
const COPY_MODE_MASK = 0o777;

async function doCopy(
	source: string,
	target: string,
	payload: ICopyPayload,
): Promise<void> {
	// Keep track of paths already copied to prevent
	// cycles from symbolic links to cause issues
	if (payload.handledSourcePaths.has(source)) {
		return;
	} else {
		payload.handledSourcePaths.add(source);
	}

	const { stat, symbolicLink } = await SymlinkSupport.stat(source);

	// Symlink
	if (symbolicLink) {
		// Try to re-create the symlink unless `preserveSymlinks: false`
		if (payload.options.preserveSymlinks) {
			try {
				return await doCopySymlink(source, target, payload);
			} catch (error) {
				// in any case of an error fallback to normal copy via dereferencing
			}
		}

		if (symbolicLink.dangling) {
			return; // skip dangling symbolic links from here on (https://github.com/microsoft/vscode/issues/111621)
		}
	}

	// Folder
	if (stat.isDirectory()) {
		return doCopyDirectory(
			source,
			target,
			stat.mode & COPY_MODE_MASK,
			payload,
		);
	}

	// File or file-like
	else {
		return doCopyFile(source, target, stat.mode & COPY_MODE_MASK);
	}
}

async function doCopyDirectory(
	source: string,
	target: string,
	mode: number,
	payload: ICopyPayload,
): Promise<void> {
	// Create folder
	await Promises.mkdir(target, { recursive: true, mode });

	// Copy each file recursively
	const files = await readdir(source);
	for (const file of files) {
		await doCopy(join(source, file), join(target, file), payload);
	}
}

async function doCopyFile(
	source: string,
	target: string,
	mode: number,
): Promise<void> {
	// Copy file
	await Promises.copyFile(source, target);

	// restore mode (https://github.com/nodejs/node/issues/1104)
	await Promises.chmod(target, mode);
}

async function doCopySymlink(
	source: string,
	target: string,
	payload: ICopyPayload,
): Promise<void> {
	// Figure out link target
	let linkTarget = await Promises.readlink(source);

	// Special case: the symlink points to a target that is
	// actually within the path that is being copied. In that
	// case we want the symlink to point to the target and
	// not the source
	if (isEqualOrParent(linkTarget, payload.root.source, !isLinux)) {
		linkTarget = join(
			payload.root.target,
			linkTarget.substr(payload.root.source.length + 1),
		);
	}

	// Create symlink
	await Promises.symlink(linkTarget, target);
}

//#endregion

//#region Promise based fs methods

/**
 * Prefer this helper class over the `fs.promises` API to
 * enable `graceful-fs` to function properly. Given issue
 * https://github.com/isaacs/node-graceful-fs/issues/160 it
 * is evident that the module only takes care of the non-promise
 * based fs methods.
 *
 * Another reason is `realpath` being entirely different in
 * the promise based implementation compared to the other
 * one (https://github.com/microsoft/vscode/issues/118562)
 *
 * Note: using getters for a reason, since `graceful-fs`
 * patching might kick in later after modules have been
 * loaded we need to defer access to fs methods.
 * (https://github.com/microsoft/vscode/issues/124176)
 */
export const Promises = new (class {
	//#region Implemented by node.js

	get access() {
		return promisify(fs.access);
	}

	get stat() {
		return promisify(fs.stat);
	}
	get lstat() {
		return promisify(fs.lstat);
	}
	get utimes() {
		return promisify(fs.utimes);
	}

	get read() {
		// Not using `promisify` here for a reason: the return
		// type is not an object as indicated by TypeScript but
		// just the bytes read, so we create our own wrapper.

		return (
			fd: number,
			buffer: Uint8Array,
			offset: number,
			length: number,
			position: number | null,
		) => {
			return new Promise<{ bytesRead: number; buffer: Uint8Array }>(
				(resolve, reject) => {
					fs.read(
						fd,
						buffer,
						offset,
						length,
						position,
						(err, bytesRead, buffer) => {
							if (err) {
								return reject(err);
							}

							return resolve({ bytesRead, buffer });
						},
					);
				},
			);
		};
	}
	get readFile() {
		return promisify(fs.readFile);
	}

	get write() {
		// Not using `promisify` here for a reason: the return
		// type is not an object as indicated by TypeScript but
		// just the bytes written, so we create our own wrapper.

		return (
			fd: number,
			buffer: Uint8Array,
			offset: number | undefined | null,
			length: number | undefined | null,
			position: number | undefined | null,
		) => {
			return new Promise<{ bytesWritten: number; buffer: Uint8Array }>(
				(resolve, reject) => {
					fs.write(
						fd,
						buffer,
						offset,
						length,
						position,
						(err, bytesWritten, buffer) => {
							if (err) {
								return reject(err);
							}

							return resolve({ bytesWritten, buffer });
						},
					);
				},
			);
		};
	}

	get appendFile() {
		return promisify(fs.appendFile);
	}

	get fdatasync() {
		return promisify(fs.fdatasync);
	}
	get truncate() {
		return promisify(fs.truncate);
	}

	get copyFile() {
		return promisify(fs.copyFile);
	}

	get open() {
		return promisify(fs.open);
	}
	get close() {
		return promisify(fs.close);
	}

	get symlink() {
		return promisify(fs.symlink);
	}
	get readlink() {
		return promisify(fs.readlink);
	}

	get chmod() {
		return promisify(fs.chmod);
	}

	get mkdir() {
		return promisify(fs.mkdir);
	}

	get unlink() {
		return promisify(fs.unlink);
	}
	get rmdir() {
		return promisify(fs.rmdir);
	}

	get realpath() {
		return promisify(fs.realpath);
	}

	//#endregion

	//#region Implemented by us

	async exists(path: string): Promise<boolean> {
		try {
			await Promises.access(path);

			return true;
		} catch {
			return false;
		}
	}

	get readdir() {
		return readdir;
	}
	get readDirsInDir() {
		return readDirsInDir;
	}

	get writeFile() {
		return writeFile;
	}

	get rm() {
		return rimraf;
	}

	get rename() {
		return rename;
	}
	get copy() {
		return copy;
	}

	//#endregion
})();

//#endregion
