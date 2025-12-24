/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../util/vs/base/common/event';
import { CopilotToken, ExtendedTokenInfo } from './copilotToken';
import { ICopilotTokenManager } from './copilotTokenManager';

/**
 * LOCAL MODE: A null implementation of ICopilotTokenManager that always returns a valid fake token.
 * This removes the need for GitHub authentication.
 */
export class NullCopilotTokenManager implements ICopilotTokenManager {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidCopilotTokenRefresh = new Emitter<void>();
	readonly onDidCopilotTokenRefresh: Event<void> = this._onDidCopilotTokenRefresh.event;

	private _fakeToken: CopilotToken | undefined;

	private createFakeToken(): CopilotToken {
		// Create a fake token that has all features enabled
		const fakeTokenInfo: ExtendedTokenInfo = {
			// Token format: key1=value1;key2=value2:signature
			// Include all feature flags enabled
			token: 'tid=local;exp=9999999999;sku=copilot_enterprise;rt=1;ccr=1;editor_preview_features=1;mcp=1;fcv1=1:local_signature',
			expires_at: Math.floor(Date.now() / 1000) + 86400 * 365, // 1 year from now
			refresh_in: 86400 * 365, // 1 year
			organization_list: [],
			enterprise_list: [],
			code_quote_enabled: true,
			public_suggestions: 'enabled',
			telemetry: 'disabled', // Disable telemetry
			copilotignore_enabled: true,
			endpoints: {
				api: 'http://127.0.0.1:8765',
				telemetry: '',
				proxy: 'http://127.0.0.1:8765',
			},
			chat_enabled: true,
			individual: false, // Not individual = has more features
			sku: 'copilot_enterprise_seat',
			username: 'local_user',
			isVscodeTeamMember: true, // Enable internal features
			copilot_plan: 'enterprise',
			blackbird_clientside_indexing: true,
			codex_agent_enabled: true,
			quota_snapshots: {
				chat: {
					quota_id: 'local',
					entitlement: 999999,
					remaining: 999999,
					unlimited: true,
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 100,
				},
				completions: {
					quota_id: 'local',
					entitlement: 999999,
					remaining: 999999,
					unlimited: true,
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 100,
				},
				premium_interactions: {
					quota_id: 'local',
					entitlement: 999999,
					remaining: 999999,
					unlimited: true,
					overage_count: 0,
					overage_permitted: true,
					percent_remaining: 100,
				},
			},
			quota_reset_date: new Date(Date.now() + 86400 * 365 * 1000).toISOString(),
		};

		return new CopilotToken(fakeTokenInfo);
	}

	async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		if (!this._fakeToken) {
			this._fakeToken = this.createFakeToken();
		}
		return this._fakeToken;
	}

	resetCopilotToken(_httpError?: number): void {
		// No-op - we always have a valid token
		this._fakeToken = undefined;
	}
}
