/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FetchOptions, RequestMetadata } from '@vscode/copilot-api';
import { ICAPIClientService } from '../common/capiClient';

/**
 * LOCAL MODE: A null implementation of ICAPIClientService that doesn't make any remote calls.
 * All CAPI-dependent features will be disabled.
 */
export class NullCAPIClientImpl implements ICAPIClientService {
	declare readonly _serviceBrand: undefined;

	abExpContext: string | undefined;

	// Return local server URLs
	get proxyBaseURL(): string {
		return 'http://127.0.0.1:8777';
	}

	get dotcomAPIURL(): string {
		return 'http://127.0.0.1:8777';
	}

	get capiPingURL(): string {
		return 'http://127.0.0.1:8777/health';
	}

	get copilotTelemetryURL(): string {
		return ''; // No telemetry
	}

	makeRequest<T>(_request: FetchOptions, _requestMetadata: RequestMetadata): Promise<T> {
		// Return a rejected promise for any CAPI requests
		return Promise.reject(new Error('CAPI not available in local mode'));
	}

	updateDomains(_moduleToken: string | undefined, _enterpriseValue: string | undefined): boolean {
		// No-op - domains don't change in local mode
		return false;
	}
}
