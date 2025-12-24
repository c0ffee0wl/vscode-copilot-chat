/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, ExtensionContext } from 'vscode';
import { resolve } from '../../../util/vs/base/common/path';
import { registerFakeAuthenticationProvider } from '../../../platform/authentication/vscode-node/fakeAuthenticationProvider';
import { baseActivate } from '../vscode/extension';
import { vscodeNodeContributions } from './contributions';
import { registerServices } from './services';

/**
 * LOCAL MODE: Set VS Code's chat entitlement context keys to make it think user is signed in.
 * These context keys are checked by VS Code's built-in chat UI to show/hide "Sign in" messages.
 * We set them repeatedly because VS Code's ChatEntitlementService may overwrite them.
 */
function setLocalModeContextKeys() {
	const setKeys = () => {
		// Entitlement context keys - pretend to be a Pro user
		commands.executeCommand('setContext', 'chatEntitlementSignedOut', false);
		commands.executeCommand('setContext', 'chatPlanPro', true);
		commands.executeCommand('setContext', 'chatPlanFree', false);
		commands.executeCommand('setContext', 'chatPlanBusiness', false);
		commands.executeCommand('setContext', 'chatPlanEnterprise', false);
		commands.executeCommand('setContext', 'chatPlanProPlus', false);
		commands.executeCommand('setContext', 'chatPlanCanSignUp', false);

		// Setup context keys - pretend extension is installed and user is registered
		commands.executeCommand('setContext', 'chatSetupInstalled', true);
		commands.executeCommand('setContext', 'chatSetupRegistered', true);
		commands.executeCommand('setContext', 'chatSetupHidden', false);
		commands.executeCommand('setContext', 'chatSetupDisabled', false);
		commands.executeCommand('setContext', 'chatSetupUntrusted', false);
		commands.executeCommand('setContext', 'chatSetupLater', false);

		// Quota context keys - no quota exceeded
		commands.executeCommand('setContext', 'chatQuotaExceeded', false);
		commands.executeCommand('setContext', 'completionsQuotaExceeded', false);

		// Anonymous context - not anonymous
		commands.executeCommand('setContext', 'chatAnonymous', false);
	};

	// Set immediately
	setKeys();

	// Set again after delays to override VS Code's ChatEntitlementService
	setTimeout(setKeys, 500);
	setTimeout(setKeys, 1500);
	setTimeout(setKeys, 3000);
	setTimeout(setKeys, 5000);

	// Keep setting periodically
	setInterval(setKeys, 10000);
}

// ###############################################################################################
// ###                                                                                         ###
// ###                 Node extension that runs ONLY in node.js extension host.                ###
// ###                                                                                         ###
// ### !!! Prefer to add code in ../vscode/extension.ts to support all extension runtimes !!!  ###
// ###                                                                                         ###
// ###############################################################################################

//#region TODO@bpasero this needs cleanup
import '../../intents/node/allIntents';

function configureDevPackages() {
	try {
		const sourceMapSupport = require('source-map-support');
		sourceMapSupport.install();
		const dotenv = require('dotenv');
		dotenv.config({ path: [resolve(__dirname, '../.env')] });
	} catch (err) {
		console.error(err);
	}
}
//#endregion

export function activate(context: ExtensionContext, forceActivation?: boolean) {
	// LOCAL MODE: Register fake GitHub auth provider to satisfy VS Code's chat UI
	context.subscriptions.push(registerFakeAuthenticationProvider(context));

	// LOCAL MODE: Set context keys to make VS Code think user is signed in
	setLocalModeContextKeys();

	return baseActivate({
		context,
		registerServices,
		contributions: vscodeNodeContributions,
		configureDevPackages,
		forceActivation
	});
}
