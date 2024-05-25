/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "vs/base/common/lifecycle";
import type { IObservable, IObserver } from "vs/base/common/observable";

export function onObservableChange<T>(
	observable: IObservable<unknown, T>,
	callback: (value: T) => void,
): IDisposable {
	const o: IObserver = {
		beginUpdate() {},
		endUpdate() {},
		handlePossibleChange(observable) {
			observable.reportChanges();
		},
		handleChange<T2, TChange>(
			_observable: IObservable<T2, TChange>,
			change: TChange,
		) {
			callback(change as any as T);
		},
	};

	observable.addObserver(o);
	return {
		dispose() {
			observable.removeObserver(o);
		},
	};
}
