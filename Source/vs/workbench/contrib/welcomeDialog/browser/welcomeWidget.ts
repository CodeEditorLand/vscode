/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import "vs/css!./media/welcomeWidget";
import { $, append, hide } from "vs/base/browser/dom";
import { renderFormattedText } from "vs/base/browser/formattedTextRenderer";
import { ActionBar } from "vs/base/browser/ui/actionbar/actionbar";
import { ButtonBar } from "vs/base/browser/ui/button/button";
import { renderLabelWithIcons } from "vs/base/browser/ui/iconLabel/iconLabels";
import {
	Action,
	type WorkbenchActionExecutedClassification,
	type WorkbenchActionExecutedEvent,
} from "vs/base/common/actions";
import { Codicon } from "vs/base/common/codicons";
import type { Color } from "vs/base/common/color";
import { MarkdownString } from "vs/base/common/htmlContent";
import { mnemonicButtonLabel } from "vs/base/common/labels";
import { Disposable } from "vs/base/common/lifecycle";
import { type LinkedText, parseLinkedText } from "vs/base/common/linkedText";
import { ThemeIcon } from "vs/base/common/themables";
import {
	type ICodeEditor,
	type IOverlayWidget,
	type IOverlayWidgetPosition,
	OverlayWidgetPositionPreference,
} from "vs/editor/browser/editorBrowser";
import { MarkdownRenderer } from "vs/editor/browser/widget/markdownRenderer/browser/markdownRenderer";
import { localize } from "vs/nls";
import type { ICommandService } from "vs/platform/commands/common/commands";
import type { IInstantiationService } from "vs/platform/instantiation/common/instantiation";
import { Link } from "vs/platform/opener/browser/link";
import type { IOpenerService } from "vs/platform/opener/common/opener";
import type { ITelemetryService } from "vs/platform/telemetry/common/telemetry";
import { defaultButtonStyles } from "vs/platform/theme/browser/defaultStyles";
import {
	contrastBorder,
	editorWidgetBackground,
	editorWidgetForeground,
	widgetBorder,
	widgetShadow,
} from "vs/platform/theme/common/colorRegistry";
import { registerThemingParticipant } from "vs/platform/theme/common/themeService";

export class WelcomeWidget extends Disposable implements IOverlayWidget {
	private readonly _rootDomNode: HTMLElement;
	private readonly element: HTMLElement;
	private readonly messageContainer: HTMLElement;
	private readonly markdownRenderer =
		this.instantiationService.createInstance(MarkdownRenderer, {});

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly instantiationService: IInstantiationService,
		private readonly commandService: ICommandService,
		private readonly telemetryService: ITelemetryService,
		private readonly openerService: IOpenerService,
	) {
		super();
		this._rootDomNode = document.createElement("div");
		this._rootDomNode.className = "welcome-widget";

		this.element = this._rootDomNode.appendChild($(".monaco-dialog-box"));
		this.element.setAttribute("role", "dialog");

		hide(this._rootDomNode);

		this.messageContainer = this.element.appendChild(
			$(".dialog-message-container"),
		);
	}

	async executeCommand(commandId: string, ...args: string[]) {
		try {
			await this.commandService.executeCommand(commandId, ...args);
			this.telemetryService.publicLog2<
				WorkbenchActionExecutedEvent,
				WorkbenchActionExecutedClassification
			>("workbenchActionExecuted", {
				id: commandId,
				from: "welcomeWidget",
			});
		} catch (ex) {}
	}

	public async render(
		title: string,
		message: string,
		buttonText: string,
		buttonAction: string,
	) {
		if (!this._editor._getViewModel()) {
			return;
		}

		await this.buildWidgetContent(title, message, buttonText, buttonAction);
		this._editor.addOverlayWidget(this);
		this._show();
		this.telemetryService.publicLog2<
			WorkbenchActionExecutedEvent,
			WorkbenchActionExecutedClassification
		>("workbenchActionExecuted", {
			id: "welcomeWidgetRendered",
			from: "welcomeWidget",
		});
	}

	private async buildWidgetContent(
		title: string,
		message: string,
		buttonText: string,
		buttonAction: string,
	) {
		const actionBar = this._register(new ActionBar(this.element, {}));

		const action = this._register(
			new Action(
				"dialog.close",
				localize("dialogClose", "Close Dialog"),
				ThemeIcon.asClassName(Codicon.dialogClose),
				true,
				async () => {
					this._hide();
				},
			),
		);
		actionBar.push(action, { icon: true, label: false });

		const renderBody = (message: string, icon: string): MarkdownString => {
			const mds = new MarkdownString(undefined, {
				supportThemeIcons: true,
				supportHtml: true,
			});
			mds.appendMarkdown(`<a class="copilot">$(${icon})</a>`);
			mds.appendMarkdown(message);
			return mds;
		};

		const titleElement = this.messageContainer.appendChild(
			$("#monaco-dialog-message-detail.dialog-message-detail-title"),
		);
		const titleElementMdt = this.markdownRenderer.render(
			renderBody(title, "zap"),
		);
		titleElement.appendChild(titleElementMdt.element);

		this.buildStepMarkdownDescription(
			this.messageContainer,
			message
				.split("\n")
				.filter((x) => x)
				.map((text) => parseLinkedText(text)),
		);

		const buttonsRowElement = this.messageContainer.appendChild(
			$(".dialog-buttons-row"),
		);
		const buttonContainer = buttonsRowElement.appendChild(
			$(".dialog-buttons"),
		);

		const buttonBar = this._register(new ButtonBar(buttonContainer));
		const primaryButton = this._register(
			buttonBar.addButtonWithDescription({
				title: true,
				secondary: false,
				...defaultButtonStyles,
			}),
		);
		primaryButton.label = mnemonicButtonLabel(buttonText, true);

		this._register(
			primaryButton.onDidClick(async () => {
				await this.executeCommand(buttonAction);
			}),
		);

		buttonBar.buttons[0].focus();
	}

	private buildStepMarkdownDescription(
		container: HTMLElement,
		text: LinkedText[],
	) {
		for (const linkedText of text) {
			const p = append(container, $("p"));
			for (const node of linkedText.nodes) {
				if (typeof node === "string") {
					const labelWithIcon = renderLabelWithIcons(node);
					for (const element of labelWithIcon) {
						if (typeof element === "string") {
							p.appendChild(
								renderFormattedText(element, {
									inline: true,
									renderCodeSegments: true,
								}),
							);
						} else {
							p.appendChild(element);
						}
					}
				} else {
					const link = this.instantiationService.createInstance(
						Link,
						p,
						node,
						{
							opener: (href: string) => {
								this.telemetryService.publicLog2<
									WorkbenchActionExecutedEvent,
									WorkbenchActionExecutedClassification
								>("workbenchActionExecuted", {
									id: "welcomeWidetLinkAction",
									from: "welcomeWidget",
								});
								this.openerService.open(href, {
									allowCommands: true,
								});
							},
						},
					);
					this._register(link);
				}
			}
		}
		return container;
	}

	getId(): string {
		return "editor.contrib.welcomeWidget";
	}

	getDomNode(): HTMLElement {
		return this._rootDomNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER,
		};
	}

	private _isVisible = false;

	private _show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._rootDomNode.style.display = "block";
	}

	private _hide(): void {
		if (!this._isVisible) {
			return;
		}

		this._isVisible = true;
		this._rootDomNode.style.display = "none";
		this._editor.removeOverlayWidget(this);
		this.telemetryService.publicLog2<
			WorkbenchActionExecutedEvent,
			WorkbenchActionExecutedClassification
		>("workbenchActionExecuted", {
			id: "welcomeWidgetDismissed",
			from: "welcomeWidget",
		});
	}
}

registerThemingParticipant((theme, collector) => {
	const addBackgroundColorRule = (
		selector: string,
		color: Color | undefined,
	): void => {
		if (color) {
			collector.addRule(
				`.monaco-editor ${selector} { background-color: ${color}; }`,
			);
		}
	};

	const widgetBackground = theme.getColor(editorWidgetBackground);
	addBackgroundColorRule(".welcome-widget", widgetBackground);

	const widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(
			`.welcome-widget { box-shadow: 0 0 8px 2px ${widgetShadowColor}; }`,
		);
	}

	const widgetBorderColor = theme.getColor(widgetBorder);
	if (widgetBorderColor) {
		collector.addRule(
			`.welcome-widget { border-left: 1px solid ${widgetBorderColor}; border-right: 1px solid ${widgetBorderColor}; border-bottom: 1px solid ${widgetBorderColor}; }`,
		);
	}

	const hcBorder = theme.getColor(contrastBorder);
	if (hcBorder) {
		collector.addRule(`.welcome-widget { border: 1px solid ${hcBorder}; }`);
	}

	const foreground = theme.getColor(editorWidgetForeground);
	if (foreground) {
		collector.addRule(`.welcome-widget { color: ${foreground}; }`);
	}
});
