/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationGetSessionOptions, AuthenticationGetSessionPresentationOptions, AuthenticationSession } from 'vscode';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { CopilotToken, ExtendedTokenInfo } from './copilotToken';
import { IAuthenticationService } from './authentication';

/**
 * LOCAL MODE: A null implementation of IAuthenticationService that always returns valid fake sessions.
 * This removes the need for GitHub authentication entirely.
 */
export class NullAuthenticationService extends Disposable implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAuthenticationChange = this._register(new Emitter<void>());
	readonly onDidAuthenticationChange: Event<void> = this._onDidAuthenticationChange.event;

	private readonly _onDidAccessTokenChange = this._register(new Emitter<void>());
	readonly onDidAccessTokenChange: Event<void> = this._onDidAccessTokenChange.event;

	private readonly _onDidAdoAuthenticationChange = this._register(new Emitter<void>());
	readonly onDidAdoAuthenticationChange: Event<void> = this._onDidAdoAuthenticationChange.event;

	private readonly _fakeSession: AuthenticationSession = {
		id: 'local-session',
		accessToken: 'local-access-token',
		account: {
			id: 'local-user',
			label: 'Local User',
		},
		scopes: ['user:email', 'read:user', 'repo', 'workflow'],
	};

	private _copilotToken: CopilotToken | undefined;

	readonly isMinimalMode = false;

	get anyGitHubSession(): AuthenticationSession | undefined {
		return this._fakeSession;
	}

	get permissiveGitHubSession(): AuthenticationSession | undefined {
		return this._fakeSession;
	}

	speculativeDecodingEndpointToken: string | undefined = 'local-sd-token';

	get copilotToken(): CopilotToken | undefined {
		if (!this._copilotToken) {
			this._copilotToken = this.createFakeToken();
		}
		return this._copilotToken;
	}

	private createFakeToken(): CopilotToken {
		const fakeTokenInfo: ExtendedTokenInfo = {
			// ccr=0 disables GitHub code review agent (requires CAPI), uses local review instead
			token: 'tid=local;exp=9999999999;sku=copilot_enterprise;rt=1;ccr=0;editor_preview_features=1;mcp=1;fcv1=1:local_signature',
			expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
			refresh_in: 86400 * 365,
			organization_list: [],
			enterprise_list: [],
			code_quote_enabled: true,
			public_suggestions: 'enabled',
			telemetry: 'disabled',
			copilotignore_enabled: true,
			endpoints: {
				api: 'http://127.0.0.1:8777',
				telemetry: '',
				proxy: 'http://127.0.0.1:8777',
			},
			chat_enabled: true,
			individual: false,
			sku: 'copilot_enterprise_seat',
			username: 'local_user',
			isVscodeTeamMember: true,
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

	async getGitHubSession(
		_kind: 'permissive' | 'any',
		_options: AuthenticationGetSessionOptions & { createIfNone?: boolean | AuthenticationGetSessionPresentationOptions; forceNewSession?: boolean | AuthenticationGetSessionPresentationOptions }
	): Promise<AuthenticationSession> {
		return this._fakeSession;
	}

	async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		if (!this._copilotToken) {
			this._copilotToken = this.createFakeToken();
		}
		return this._copilotToken;
	}

	resetCopilotToken(_httpError?: number): void {
		this._copilotToken = undefined;
	}

	async getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		// Return a fake base64 token for ADO access
		return Buffer.from('local-ado-token').toString('base64');
	}
}
