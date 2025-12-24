/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChat, type ChatRequest } from 'vscode';
import { ChatEndpointFamily, EmbeddingsEndpointFamily, ICompletionModelInformation, IEndpointProvider } from '../../../platform/endpoint/common/endpointProvider';
import { createLocalModelMetadata, LocalLlmEndpoint } from '../../../platform/endpoint/node/localLlmEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../platform/networking/common/networking';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { ITokenizerProvider } from '../../../platform/tokenizer/node/tokenizer';

/**
 * LOCAL MODE: Endpoint provider that always returns the local LLM endpoint.
 * This provider removes all CAPI dependencies and provides a single local endpoint.
 */
export class LocalEndpointProvider implements IEndpointProvider {
	declare readonly _serviceBrand: undefined;

	private readonly _serverUrl: string;
	private _chatEndpoint: IChatEndpoint | undefined;

	constructor(
		serverUrl: string,
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ITokenizerProvider private readonly _tokenizerProvider: ITokenizerProvider,
		@ILogService private readonly _logService: ILogService
	) {
		this._serverUrl = serverUrl || 'http://127.0.0.1:8777';
		this._logService.info(`LocalEndpointProvider initialized with server URL: ${this._serverUrl}`);
	}

	private getOrCreateLocalEndpoint(): IChatEndpoint {
		if (!this._chatEndpoint) {
			const modelMetadata = createLocalModelMetadata();
			this._chatEndpoint = new LocalLlmEndpoint(
				modelMetadata,
				this._serverUrl,
				this._fetcherService,
				this._telemetryService,
				this._tokenizerProvider,
				this._logService
			);
		}
		return this._chatEndpoint;
	}

	async getChatEndpoint(_requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		this._logService.trace('LocalEndpointProvider: Resolving chat endpoint to local LLM');
		return this.getOrCreateLocalEndpoint();
	}

	async getEmbeddingsEndpoint(_family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		// Embeddings not supported in local mode
		throw new Error('Embeddings not supported in local mode. Use local indexing instead.');
	}

	async getAllCompletionModels(_forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		// No completion models in local mode
		return [];
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		return [this.getOrCreateLocalEndpoint()];
	}
}
