/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action, type IAction } from "vs/base/common/actions";
import { Emitter, Event } from "vs/base/common/event";
import {
	Disposable,
	DisposableStore,
	type IDisposable,
} from "vs/base/common/lifecycle";
import { localize } from "vs/nls";
import {
	InstantiationType,
	registerSingleton,
} from "vs/platform/instantiation/common/extensions";
import {
	type INeverShowAgainOptions,
	type INotification,
	type INotificationActions,
	type INotificationHandle,
	INotificationService,
	type INotificationSource,
	type INotificationSourceFilter,
	type IPromptChoice,
	type IPromptOptions,
	type IStatusMessageOptions,
	NeverShowAgainScope,
	NoOpNotification,
	type NotificationMessage,
	NotificationsFilter,
	Severity,
	isNotificationSource,
} from "vs/platform/notification/common/notification";
import {
	IStorageService,
	StorageScope,
	StorageTarget,
} from "vs/platform/storage/common/storage";
import {
	ChoiceAction,
	NotificationChangeType,
	NotificationsModel,
} from "vs/workbench/common/notifications";

export class NotificationService
	extends Disposable
	implements INotificationService
{
	declare readonly _serviceBrand: undefined;

	readonly model = this._register(new NotificationsModel());

	private readonly _onDidAddNotification = this._register(
		new Emitter<INotification>(),
	);
	readonly onDidAddNotification = this._onDidAddNotification.event;

	private readonly _onDidRemoveNotification = this._register(
		new Emitter<INotification>(),
	);
	readonly onDidRemoveNotification = this._onDidRemoveNotification.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.updateFilters();
		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(
			this.model.onDidChangeNotification((e) => {
				switch (e.kind) {
					case NotificationChangeType.ADD:
					case NotificationChangeType.REMOVE: {
						const source =
							typeof e.item.sourceId === "string" &&
							typeof e.item.source === "string"
								? { id: e.item.sourceId, label: e.item.source }
								: e.item.source;

						const notification: INotification = {
							message: e.item.message.original,
							severity: e.item.severity,
							source,
							priority: e.item.priority,
						};

						if (e.kind === NotificationChangeType.ADD) {
							// Make sure to track sources for notifications by registering
							// them with our do not disturb system which is backed by storage

							if (isNotificationSource(source)) {
								if (this.mapSourceToFilter.has(source.id)) {
									this.updateSourceFilter(source);
								} else {
									this.setFilter({
										...source,
										filter: NotificationsFilter.OFF,
									});
								}
							}

							this._onDidAddNotification.fire(notification);
						}

						if (e.kind === NotificationChangeType.REMOVE) {
							this._onDidRemoveNotification.fire(notification);
						}

						break;
					}
				}
			}),
		);
	}

	//#region Filters

	private static readonly GLOBAL_FILTER_SETTINGS_KEY =
		"notifications.doNotDisturbMode";
	private static readonly PER_SOURCE_FILTER_SETTINGS_KEY =
		"notifications.perSourceDoNotDisturbMode";

	private readonly _onDidChangeFilter = this._register(new Emitter<void>());
	readonly onDidChangeFilter = this._onDidChangeFilter.event;

	private globalFilterEnabled = this.storageService.getBoolean(
		NotificationService.GLOBAL_FILTER_SETTINGS_KEY,
		StorageScope.APPLICATION,
		false,
	);

	private readonly mapSourceToFilter: Map<
		string /** source id */,
		INotificationSourceFilter
	> = (() => {
		const map = new Map<string, INotificationSourceFilter>();

		for (const sourceFilter of this.storageService.getObject<
			INotificationSourceFilter[]
		>(
			NotificationService.PER_SOURCE_FILTER_SETTINGS_KEY,
			StorageScope.APPLICATION,
			[],
		)) {
			map.set(sourceFilter.id, sourceFilter);
		}

		return map;
	})();

	setFilter(filter: NotificationsFilter | INotificationSourceFilter): void {
		if (typeof filter === "number") {
			if (
				this.globalFilterEnabled ===
				(filter === NotificationsFilter.ERROR)
			) {
				return; // no change
			}

			// Store into model and persist
			this.globalFilterEnabled = filter === NotificationsFilter.ERROR;
			this.storageService.store(
				NotificationService.GLOBAL_FILTER_SETTINGS_KEY,
				this.globalFilterEnabled,
				StorageScope.APPLICATION,
				StorageTarget.MACHINE,
			);

			// Update model
			this.updateFilters();

			// Events
			this._onDidChangeFilter.fire();
		} else {
			const existing = this.mapSourceToFilter.get(filter.id);
			if (
				existing?.filter === filter.filter &&
				existing.label === filter.label
			) {
				return; // no change
			}

			// Store into model and persist
			this.mapSourceToFilter.set(filter.id, {
				id: filter.id,
				label: filter.label,
				filter: filter.filter,
			});
			this.saveSourceFilters();

			// Update model
			this.updateFilters();
		}
	}

	getFilter(source?: INotificationSource): NotificationsFilter {
		if (source) {
			return (
				this.mapSourceToFilter.get(source.id)?.filter ??
				NotificationsFilter.OFF
			);
		}

		return this.globalFilterEnabled
			? NotificationsFilter.ERROR
			: NotificationsFilter.OFF;
	}

	private updateSourceFilter(source: INotificationSource): void {
		const existing = this.mapSourceToFilter.get(source.id);
		if (!existing) {
			return; // nothing to do
		}

		// Store into model and persist
		if (existing.label !== source.label) {
			this.mapSourceToFilter.set(source.id, {
				id: source.id,
				label: source.label,
				filter: existing.filter,
			});
			this.saveSourceFilters();
		}
	}

	private saveSourceFilters(): void {
		this.storageService.store(
			NotificationService.PER_SOURCE_FILTER_SETTINGS_KEY,
			JSON.stringify([...this.mapSourceToFilter.values()]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
	}

	getFilters(): INotificationSourceFilter[] {
		return [...this.mapSourceToFilter.values()];
	}

	private updateFilters(): void {
		this.model.setFilter({
			global: this.globalFilterEnabled
				? NotificationsFilter.ERROR
				: NotificationsFilter.OFF,
			sources: new Map(
				[...this.mapSourceToFilter.values()].map((source) => [
					source.id,
					source.filter,
				]),
			),
		});
	}

	removeFilter(sourceId: string): void {
		if (this.mapSourceToFilter.delete(sourceId)) {
			// Persist
			this.saveSourceFilters();

			// Update model
			this.updateFilters();
		}
	}

	//#endregion

	info(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			for (const messageEntry of message) {
				this.info(messageEntry);
			}

			return;
		}

		this.model.addNotification({ severity: Severity.Info, message });
	}

	warn(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			for (const messageEntry of message) {
				this.warn(messageEntry);
			}

			return;
		}

		this.model.addNotification({ severity: Severity.Warning, message });
	}

	error(message: NotificationMessage | NotificationMessage[]): void {
		if (Array.isArray(message)) {
			for (const messageEntry of message) {
				this.error(messageEntry);
			}

			return;
		}

		this.model.addNotification({ severity: Severity.Error, message });
	}

	notify(notification: INotification): INotificationHandle {
		const toDispose = new DisposableStore();

		// Handle neverShowAgain option accordingly

		if (notification.neverShowAgain) {
			const scope = this.toStorageScope(notification.neverShowAgain);
			const id = notification.neverShowAgain.id;

			// If the user already picked to not show the notification
			// again, we return with a no-op notification here
			if (this.storageService.getBoolean(id, scope)) {
				return new NoOpNotification();
			}

			const neverShowAgainAction = toDispose.add(
				new Action(
					"workbench.notification.neverShowAgain",
					localize("neverShowAgain", "Don't Show Again"),
					undefined,
					true,
					async () => {
						// Close notification
						handle.close();

						// Remember choice
						this.storageService.store(
							id,
							true,
							scope,
							StorageTarget.USER,
						);
					},
				),
			);

			// Insert as primary or secondary action
			const actions = {
				primary: notification.actions?.primary || [],
				secondary: notification.actions?.secondary || [],
			};
			if (notification.neverShowAgain.isSecondary) {
				actions.secondary = [
					...actions.secondary,
					neverShowAgainAction,
				]; // actions comes last
			} else {
				actions.primary = [neverShowAgainAction, ...actions.primary]; // action comes first
			}

			notification.actions = actions;
		}

		// Show notification
		const handle = this.model.addNotification(notification);

		// Cleanup when notification gets disposed
		Event.once(handle.onDidClose)(() => toDispose.dispose());

		return handle;
	}

	private toStorageScope(options: INeverShowAgainOptions): StorageScope {
		switch (options.scope) {
			case NeverShowAgainScope.APPLICATION:
				return StorageScope.APPLICATION;
			case NeverShowAgainScope.PROFILE:
				return StorageScope.PROFILE;
			case NeverShowAgainScope.WORKSPACE:
				return StorageScope.WORKSPACE;
			default:
				return StorageScope.APPLICATION;
		}
	}

	prompt(
		severity: Severity,
		message: string,
		choices: IPromptChoice[],
		options?: IPromptOptions,
	): INotificationHandle {
		const toDispose = new DisposableStore();

		// Handle neverShowAgain option accordingly
		if (options?.neverShowAgain) {
			const scope = this.toStorageScope(options.neverShowAgain);
			const id = options.neverShowAgain.id;

			// If the user already picked to not show the notification
			// again, we return with a no-op notification here
			if (this.storageService.getBoolean(id, scope)) {
				return new NoOpNotification();
			}

			const neverShowAgainChoice = {
				label: localize("neverShowAgain", "Don't Show Again"),
				run: () =>
					this.storageService.store(
						id,
						true,
						scope,
						StorageTarget.USER,
					),
				isSecondary: options.neverShowAgain.isSecondary,
			};

			// Insert as primary or secondary action
			if (options.neverShowAgain.isSecondary) {
				choices = [...choices, neverShowAgainChoice]; // actions comes last
			} else {
				choices = [neverShowAgainChoice, ...choices]; // action comes first
			}
		}

		let choiceClicked = false;

		// Convert choices into primary/secondary actions
		const primaryActions: IAction[] = [];
		const secondaryActions: IAction[] = [];
		choices.forEach((choice, index) => {
			const action = new ChoiceAction(
				`workbench.dialog.choice.${index}`,
				choice,
			);
			if (choice.isSecondary) {
				secondaryActions.push(action);
			} else {
				primaryActions.push(action);
			}

			// React to action being clicked
			toDispose.add(
				action.onDidRun(() => {
					choiceClicked = true;

					// Close notification unless we are told to keep open
					if (!choice.keepOpen) {
						handle.close();
					}
				}),
			);

			toDispose.add(action);
		});

		// Show notification with actions
		const actions: INotificationActions = {
			primary: primaryActions,
			secondary: secondaryActions,
		};
		const handle = this.notify({
			severity,
			message,
			actions,
			sticky: options?.sticky,
			priority: options?.priority,
		});

		Event.once(handle.onDidClose)(() => {
			// Cleanup when notification gets disposed
			toDispose.dispose();

			// Indicate cancellation to the outside if no action was executed
			if (
				options &&
				typeof options.onCancel === "function" &&
				!choiceClicked
			) {
				options.onCancel();
			}
		});

		return handle;
	}

	status(
		message: NotificationMessage,
		options?: IStatusMessageOptions,
	): IDisposable {
		return this.model.showStatusMessage(message, options);
	}
}

registerSingleton(
	INotificationService,
	NotificationService,
	InstantiationType.Delayed,
);
