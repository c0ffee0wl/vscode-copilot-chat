/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHeaders } from '../../networking/common/fetcherService';
import { IChatQuotaService } from './chatQuotaService';

/**
 * LOCAL MODE: A null implementation of IChatQuotaService that never has exhausted quota.
 * This removes subscription/quota restrictions.
 */
export class NullChatQuotaService implements IChatQuotaService {
	declare readonly _serviceBrand: undefined;

	// Never exhausted - unlimited local usage
	get quotaExhausted(): boolean {
		return false;
	}

	// Overages always enabled
	get overagesEnabled(): boolean {
		return true;
	}

	processQuotaHeaders(_headers: IHeaders): void {
		// No-op - we don't track quota locally
	}

	clearQuota(): void {
		// No-op
	}
}
