/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatRequest } from 'vscode';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ILogService } from '../../log/common/logService';
import { IChatEndpoint } from '../../networking/common/networking';
import { IAutomodeService } from './automodeService';
import { AutoChatEndpoint } from './autoChatEndpoint';

/**
 * LOCAL MODE: A null implementation of IAutomodeService that doesn't make CAPI requests.
 * Returns the first available endpoint as the "auto" selection.
 */
export class NullAutomodeService extends Disposable implements IAutomodeService {
	readonly _serviceBrand: undefined;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._serviceBrand = undefined;
	}

	async resolveAutoModeEndpoint(_chatRequest: ChatRequest | undefined, knownEndpoints: IChatEndpoint[]): Promise<IChatEndpoint> {
		if (!knownEndpoints.length) {
			throw new Error('No endpoints provided for auto mode.');
		}

		// In local mode, just use the first endpoint as the "auto" selection
		const selectedEndpoint = knownEndpoints[0];
		this._logService.trace(`NullAutomodeService: Using local endpoint ${selectedEndpoint.model} as auto mode selection`);

		// Create an AutoChatEndpoint wrapper with no discount
		const autoEndpoint = this._instantiationService.createInstance(
			AutoChatEndpoint,
			selectedEndpoint,
			'local-session-token', // fake session token
			0, // no discount
			{ low: 0, high: 0 } // no discount range
		);

		return autoEndpoint;
	}
}
