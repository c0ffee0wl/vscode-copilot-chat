/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestMetadata, RequestType } from '@vscode/copilot-api';
import { Raw } from '@vscode/prompt-tsx';
import type { CancellationToken } from 'vscode';
import { ITokenizer, TokenizerType } from '../../../util/common/tokenizer';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { generateUuid } from '../../../util/vs/base/common/uuid';
import { Source } from '../../chat/common/chatMLFetcher';
import { ChatFetchResponseType, ChatLocation, ChatResponse } from '../../chat/common/commonTypes';
import { getTextPart } from '../../chat/common/globalStringUtils';
import { ILogService } from '../../log/common/logService';
import { FinishedCallback, ICopilotToolCall, OptionalChatRequestParams } from '../../networking/common/fetch';
import { IFetcherService, Response } from '../../networking/common/fetcherService';
import { IChatEndpoint, ICreateEndpointBodyOptions, IEndpointBody, IMakeChatRequestOptions } from '../../networking/common/networking';
import { CAPIChatMessage, ChatCompletion, FinishedCompletionReason } from '../../networking/common/openai';
import { SSEProcessor } from '../../networking/node/stream';
import { ITelemetryService, TelemetryProperties } from '../../telemetry/common/telemetry';
import { TelemetryData } from '../../telemetry/common/telemetryData';
import { ITokenizerProvider } from '../../tokenizer/node/tokenizer';
import { CustomModel, IChatModelInformation, ModelPolicy } from '../common/endpointProvider';

/**
 * LOCAL MODE: Chat endpoint that connects to the local LLM server.
 * This endpoint removes all Copilot-specific functionality and directly
 * connects to a local OpenAI-compatible server.
 */
export class LocalLlmEndpoint implements IChatEndpoint {
	public readonly model: string;
	public readonly name: string;
	public readonly version: string;
	public readonly family: string;
	public readonly tokenizer: TokenizerType;
	public readonly showInModelPicker: boolean;
	public readonly isDefault: boolean;
	public readonly isFallback: boolean;
	public readonly supportsToolCalls: boolean;
	public readonly supportsVision: boolean;
	public readonly supportsPrediction: boolean;
	public readonly isPremium?: boolean | undefined;
	public readonly multiplier?: number | undefined;
	public readonly restrictedToSkus?: string[] | undefined;
	public readonly customModel?: CustomModel | undefined;

	private readonly _serverUrl: string;
	private readonly _maxTokens: number;
	private readonly _maxOutputTokens: number;

	constructor(
		public readonly modelMetadata: IChatModelInformation,
		serverUrl: string,
		private readonly _fetcherService: IFetcherService,
		private readonly _telemetryService: ITelemetryService,
		private readonly _tokenizerProvider: ITokenizerProvider,
		private readonly _logService: ILogService
	) {
		this._serverUrl = serverUrl;
		this._maxTokens = modelMetadata.capabilities.limits?.max_prompt_tokens ?? 128000;
		this._maxOutputTokens = modelMetadata.capabilities.limits?.max_output_tokens ?? 16384;
		this.model = modelMetadata.id;
		this.name = modelMetadata.name;
		this.version = modelMetadata.version;
		this.family = modelMetadata.capabilities.family;
		this.tokenizer = modelMetadata.capabilities.tokenizer;
		this.showInModelPicker = modelMetadata.model_picker_enabled;
		this.isDefault = modelMetadata.is_chat_default;
		this.isFallback = modelMetadata.is_chat_fallback;
		this.supportsToolCalls = !!modelMetadata.capabilities.supports.tool_calls;
		this.supportsVision = !!modelMetadata.capabilities.supports.vision;
		this.supportsPrediction = !!modelMetadata.capabilities.supports.prediction;
	}

	public getExtraHeaders(): Record<string, string> {
		return {
			'Content-Type': 'application/json',
		};
	}

	public get modelMaxPromptTokens(): number {
		return this._maxTokens;
	}

	public get maxOutputTokens(): number {
		return this._maxOutputTokens;
	}

	public get urlOrRequestMetadata(): string {
		// Return direct URL to local server
		return `${this._serverUrl}/v1/chat/completions`;
	}

	public get degradationReason(): string | undefined {
		return undefined;
	}

	public get policy(): 'enabled' | { terms: string } {
		// Always enabled for local mode
		return 'enabled';
	}

	public get apiType(): string {
		return 'chatCompletions';
	}

	interceptBody(body: IEndpointBody | undefined): void {
		if (!body) return;

		// Remove Copilot-specific fields
		delete (body as any)['snippy'];
		delete (body as any)['copilot_thread_id'];
		delete (body as any)['copilot_skills'];

		// Clean messages of Copilot-specific properties
		if (body.messages) {
			body.messages = body.messages.map((msg: any) => {
				const cleaned = { ...msg };
				delete cleaned['copilot_references'];
				delete cleaned['copilot_confirmations'];
				delete cleaned['copilot_cache_control'];
				return cleaned;
			});
		}

		// Remove tool calls if not supported
		if (!this.supportsToolCalls) {
			delete body['tools'];
		}
	}

	createRequestBody(options: ICreateEndpointBodyOptions): IEndpointBody {
		const body: IEndpointBody = {
			model: this.model,
			stream: true,
			max_tokens: options.maxOutputTokens ?? this._maxOutputTokens,
		};

		if (options.temperature !== undefined) {
			body.temperature = options.temperature;
		}
		if (options.topP !== undefined) {
			body.top_p = options.topP;
		}
		if (options.tools) {
			body.tools = options.tools;
		}
		if (options.messages) {
			body.messages = options.messages;
		}

		return body;
	}

	public async processResponseFromChatEndpoint(
		telemetryService: ITelemetryService,
		logService: ILogService,
		response: Response,
		expectedNumChoices: number,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData,
		cancellationToken?: CancellationToken | undefined
	): Promise<AsyncIterableObject<ChatCompletion>> {
		// Check if this is a streaming response
		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('text/event-stream')) {
			// Use SSE processor for streaming and convert FinishedCompletion to ChatCompletion
			const processor = await SSEProcessor.create(logService, telemetryService, expectedNumChoices, response, cancellationToken);
			const completions: ChatCompletion[] = [];

			for await (const finishedCompletion of processor.processSSE(finishCallback)) {
				// Convert FinishedCompletion to ChatCompletion
				const messageText = finishedCompletion.solution.text.join('');
				const message: Raw.AssistantChatMessage = {
					role: Raw.ChatRole.Assistant,
					content: messageText,
				};
				const chatCompletion: ChatCompletion = {
					blockFinished: finishedCompletion.finishOffset !== undefined,
					choiceIndex: finishedCompletion.index,
					model: finishedCompletion.solution.model,
					filterReason: finishedCompletion.filterReason,
					finishReason: finishedCompletion.reason,
					message: message,
					usage: finishedCompletion.usage,
					tokens: finishedCompletion.solution.text,
					requestId: finishedCompletion.requestId,
					telemetryData: telemetryData,
					error: finishedCompletion.error,
				};
				completions.push(chatCompletion);
			}

			return AsyncIterableObject.fromArray(completions);
		} else {
			// Non-streaming response
			return this.processNonStreamingResponse(response, finishCallback, telemetryData);
		}
	}

	private async processNonStreamingResponse(
		response: Response,
		finishCallback: FinishedCallback,
		telemetryData: TelemetryData
	): Promise<AsyncIterableObject<ChatCompletion>> {
		const textResponse = await response.text();
		const jsonResponse = JSON.parse(textResponse);
		const completions: ChatCompletion[] = [];

		for (let i = 0; i < (jsonResponse?.choices?.length || 0); i++) {
			const choice = jsonResponse.choices[i];
			const message: Raw.AssistantChatMessage = {
				role: choice.message.role,
				content: choice.message.content,
				name: choice.message.name,
				toolCalls: choice.message.toolCalls ?? choice.message.tool_calls,
			};
			const messageText = getTextPart(message.content);
			const requestId = response.headers.get('X-Request-ID') ?? generateUuid();

			const completion: ChatCompletion = {
				blockFinished: false,
				choiceIndex: i,
				model: jsonResponse.model,
				filterReason: undefined,
				finishReason: choice.finish_reason as FinishedCompletionReason,
				message: message,
				usage: jsonResponse.usage,
				tokens: [],
				requestId: { headerRequestId: requestId, gitHubRequestId: '', completionId: jsonResponse.id, created: jsonResponse.created, deploymentId: '', serverExperiments: '' },
				telemetryData: telemetryData
			};

			const functionCall: ICopilotToolCall[] = [];
			for (const tool of message.toolCalls ?? []) {
				functionCall.push({
					name: tool.function?.name ?? '',
					arguments: tool.function?.arguments ?? '',
					id: tool.id ?? '',
				});
			}
			await finishCallback(messageText, i, {
				text: messageText,
				copilotToolCalls: functionCall,
			});
			completions.push(completion);
		}

		return AsyncIterableObject.fromArray(completions);
	}

	public async acceptChatPolicy(): Promise<boolean> {
		// Always accept in local mode
		return true;
	}

	public acquireTokenizer(): ITokenizer {
		return this._tokenizerProvider.acquireTokenizer(this);
	}

	public async makeChatRequest2(options: IMakeChatRequestOptions, token: CancellationToken): Promise<ChatResponse> {
		// Direct implementation - make HTTP request to local server
		const body = this.createRequestBody({
			messages: options.messages as CAPIChatMessage[],
			maxOutputTokens: options.requestOptions?.max_tokens,
			temperature: options.requestOptions?.temperature,
			topP: options.requestOptions?.top_p,
			tools: options.requestOptions?.tools,
		});

		this.interceptBody(body);

		const url = this.urlOrRequestMetadata as string;
		const response = await this._fetcherService.fetch(url, {
			method: 'POST',
			headers: this.getExtraHeaders(),
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(`Local LLM request failed: ${response.status} ${response.statusText}`);
		}

		const telemetryData = TelemetryData.createAndMarkAsIssued({}, {});
		const finishedCb = options.finishedCb ?? (() => { });

		const completions = await this.processResponseFromChatEndpoint(
			this._telemetryService,
			this._logService,
			response,
			1,
			finishedCb,
			telemetryData,
			token
		);

		// Extract text from completions to return in proper ChatResponse format
		let messageText = '';
		let requestId = '';
		let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
		for await (const completion of completions) {
			messageText = getTextPart(completion.message.content);
			requestId = completion.requestId?.headerRequestId || '';
			usage = completion.usage;
		}

		return {
			type: ChatFetchResponseType.Success,
			value: messageText,
			requestId: requestId,
			serverRequestId: requestId,
			usage: usage,
			resolvedModel: this.model,
		};
	}

	public async makeChatRequest(
		debugName: string,
		messages: Raw.ChatMessage[],
		finishedCb: FinishedCallback | undefined,
		token: CancellationToken,
		location: ChatLocation,
		source?: Source,
		requestOptions?: Omit<OptionalChatRequestParams, 'n'>,
		userInitiatedRequest?: boolean,
		telemetryProperties?: TelemetryProperties,
	): Promise<ChatResponse> {
		return this.makeChatRequest2({
			debugName,
			messages,
			finishedCb,
			location,
			source,
			requestOptions,
			userInitiatedRequest,
			telemetryProperties,
		}, token);
	}

	public cloneWithTokenOverride(modelMaxPromptTokens: number): IChatEndpoint {
		const clonedMetadata = {
			...this.modelMetadata,
			capabilities: {
				...this.modelMetadata.capabilities,
				limits: {
					...this.modelMetadata.capabilities.limits,
					max_prompt_tokens: modelMaxPromptTokens,
				},
			},
		};
		return new LocalLlmEndpoint(
			clonedMetadata,
			this._serverUrl,
			this._fetcherService,
			this._telemetryService,
			this._tokenizerProvider,
			this._logService
		);
	}
}

/**
 * Default local model metadata.
 * Uses a generic 'local-llm' identifier - the actual model is determined by the llm library configuration.
 */
export function createLocalModelMetadata(): IChatModelInformation {
	return {
		id: 'local-llm',
		name: 'Local LLM',
		version: '1.0.0',
		model_picker_enabled: true,
		is_chat_default: true,
		is_chat_fallback: true,
		capabilities: {
			type: 'chat',
			family: 'local',
			tokenizer: TokenizerType.O200K,
			limits: {
				max_prompt_tokens: 128000,
				max_output_tokens: 16384,
				max_context_window_tokens: 128000,
			},
			supports: {
				parallel_tool_calls: true,
				tool_calls: true,
				streaming: true,
				vision: true,
				prediction: false,
				thinking: false,
			},
		},
	};
}
