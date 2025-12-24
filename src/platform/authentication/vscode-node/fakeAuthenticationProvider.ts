/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * LOCAL MODE: A fake authentication provider that registers with VS Code's authentication API.
 * This makes VS Code's native chat UI think we're authenticated.
 */
export class FakeGitHubAuthenticationProvider implements vscode.AuthenticationProvider {
	private static readonly SESSION_ID = 'fake-github-session';

	private readonly _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private readonly _session: vscode.AuthenticationSession = {
		id: FakeGitHubAuthenticationProvider.SESSION_ID,
		accessToken: 'fake-github-access-token-for-local-llm',
		account: {
			id: 'local-user',
			label: 'Local LLM User',
		},
		scopes: ['user:email', 'read:user', 'repo', 'workflow'],
	};

	async getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
		return [this._session];
	}

	async createSession(_scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
		return this._session;
	}

	async removeSession(_sessionId: string): Promise<void> {
		// No-op - we always have a session
	}

	/**
	 * Emit a session change event to notify VS Code that sessions are available.
	 */
	emitSessionChange(): void {
		this._onDidChangeSessions.fire({
			added: [this._session],
			removed: [],
			changed: [],
		});
	}
}

/**
 * Register the fake GitHub authentication provider with VS Code.
 * This must be called during extension activation.
 */
export function registerFakeAuthenticationProvider(context: vscode.ExtensionContext): vscode.Disposable {
	const provider = new FakeGitHubAuthenticationProvider();

	try {
		// Try to register for the 'github' auth provider ID that VS Code's chat uses
		const disposable = vscode.authentication.registerAuthenticationProvider(
			'github',
			'GitHub (Local)',
			provider,
			{ supportsMultipleAccounts: false }
		);
		console.log('[Local LLM] Successfully registered fake GitHub auth provider');

		// Emit session change to trigger VS Code to re-check auth status
		setTimeout(() => {
			provider.emitSessionChange();
		}, 100);

		return disposable;
	} catch (e) {
		// If registration fails (provider already exists), log and return empty disposable
		console.log('[Local LLM] Could not register fake GitHub auth provider:', e);

		// Even if we can't register, try to trigger a session via getSession
		// This makes VS Code query sessions and may trigger UI update
		setTimeout(async () => {
			try {
				await vscode.authentication.getSession('github', ['user:email'], { createIfNone: false });
			} catch { /* ignore */ }
		}, 100);

		return { dispose: () => {} };
	}
}
