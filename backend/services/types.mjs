// backend/services/types.mjs

/**
 * @typedef {'openrouter' | 'groq' | 'gemini'} AIProvider
 */

/**
 * @typedef {Object} AIMessage
 * @property {'system' | 'user' | 'assistant'} role
 * @property {string} content
 */

/**
 * @typedef {Object} AIProviderRequest
 * @property {AIProvider} provider
 * @property {string} model
 * @property {AIMessage[]} messages
 * @property {Record<string,string>} [projectFiles]
 * @property {string|null} [activeFile]
 * @property {string[]} [recentFiles]
 * @property {string[]} [folders]
 * @property {string|null} [selectedCode]
 * @property {string[]} [consoleErrors]
 * @property {string[]} [buildErrors]
 * @property {{line:number, column:number}|null} [cursorPosition]
 * @property {number} [temperature]
 * @property {number} [maxTokens]
 * @property {number} [topP]
 * @property {boolean} [stream]
 */

/**
 * @typedef {Object} AIUsage
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 */

/**
 * @typedef {Object} AIProviderResponse
 * @property {string} id
 * @property {AIProvider} provider
 * @property {string} model
 * @property {AIMessage} message
 * @property {AIUsage} [usage]
 * @property {string} [finishReason]
 */

/**
 * @typedef {Object} AIStreamChunk
 * @property {string} id
 * @property {string} content
 * @property {boolean} done
 */

/**
 * @typedef {Object} AIProviderError
 * @property {AIProvider} provider
 * @property {string} message
 * @property {string} [code]
 * @property {number} [status]
 */

/**
 * @typedef {Object} AIProviderClient
 * @property {AIProvider} provider
 * @method send(request: AIProviderRequest): Promise<AIProviderResponse>
 * @method stream(request: AIProviderRequest, onChunk: (chunk: AIStreamChunk) => void): Promise<AIProviderResponse>
 */

// No runtime exports – these are just documentation.