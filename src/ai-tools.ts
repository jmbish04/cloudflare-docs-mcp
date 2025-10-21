/**
 * @file src/ai-tools.ts
 * @description This module provides high-level, robust tools for interacting with AI models.
 */

import { z, ZodObject, ZodSchema } from 'zod';
import { createWorkersAI } from 'workers-ai-provider';
import { generateObject } from 'ai';

// --- Configuration & Model Definitions ---

const Llama4Scout = '@cf/meta/llama-4-scout-17b-16e-instruct' as const;
const MistralSmall3_1 = '@cf/mistralai/mistral-small-3.1-24b-instruct' as const;
const Hermes2Pro = '@hf/nousresearch/hermes-2-pro-mistral-7b' as const;
const Llama3_3 = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as const;

type StructuredModel = | typeof Llama4Scout | typeof MistralSmall3_1 | typeof Hermes2Pro | typeof Llama3_3;

const EmbedModel = "@cf/baai/bge-large-en-v1.5" as const;
const RerankerModel = "@cf/baai/bge-reranker-base" as const;

// --- Interfaces & Types ---

interface AiBinding { run: (model: string, options: any) => Promise<any>; }
interface VectorizeBinding { query: (vector: number[], options: { topK: number }) => Promise<any>; }
interface Env { AI: AiBinding; VECTORIZE_INDEX: VectorizeBinding; }
interface EmbeddingResponse { shape: number[]; data: number[][]; }
interface StructuredResponse<T> { success: boolean; modelUsed: StructuredModel; structuredResult: T | null; error?: string; isChunked?: boolean; }

// --- Embedding Tool Class ---

export class EmbeddingTool {
    private env: Env;
    constructor(env: Env) { this.env = env; }

    public async generateEmbedding(query: string): Promise<number[]> {
        const queryVector: EmbeddingResponse = await this.env.AI.run(EmbedModel, { text: [query] });
        if (!queryVector?.data?.[0]) { throw new Error(`Failed to generate embedding.`); }
        return queryVector.data[0];
    }

    public async rerankMatches(query: string, matches: any[], contextField: string = 'text'): Promise<any[]> {
        const rerankedMatches = await Promise.all(
            matches.map(async (match) => {
                const context = match.metadata?.[contextField] || '';
                const response = await this.env.AI.run(RerankerModel, { context, query });
                return { ...match, score: response.score || 0 };
            }),
        );
        return rerankedMatches.sort((a, b) => b.score - a.score);
    }
}

// --- Structured Response Tool Class ---

export class StructuredResponseTool {
    private env: Env;
    private maxSmallContextChars: number = 80000;

    constructor(env: Env) { this.env = env; }

    private sanitizeResponse(rawResponse: string): string {
        const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch?.[1]) return jsonMatch[1].trim();
        if ((rawResponse.startsWith('{') && rawResponse.endsWith('}')) || (rawResponse.startsWith('[') && rawResponse.endsWith(']'))) return rawResponse.trim();
        return rawResponse;
    }

    private fillMissingFields<T extends ZodObject<any>>(schema: T, aiResponse: any): z.infer<T> {
        const fullResponse: any = { ...aiResponse };
        const properties = schema.shape as Record<string, ZodSchema<any>>;
        for (const key in properties) {
            if (!(key in fullResponse) || fullResponse[key] === undefined) {
                fullResponse[key] = null;
            }
        }
        return schema.parse(fullResponse);
    }

    private async executeModel<T extends ZodObject<any>>(modelName: StructuredModel, text: string, schema: T, isChunk: boolean = false): Promise<StructuredResponse<z.infer<T>>> {
        const workersai = createWorkersAI({ binding: this.env.AI as any });
        const model = workersai(modelName);
        const prompt = `Analyze the provided TEXT and conform your output strictly to the JSON structure required by the schema. Only output the JSON object. TEXT: "${text}"`;
        try {
            const { object } = await generateObject({ model, prompt, schema });
            const validatedResponse = this.fillMissingFields(schema, object);
            return { success: true, modelUsed: modelName, structuredResult: validatedResponse, isChunked: isChunk };
        } catch (e: any) {
            return { success: false, modelUsed: modelName, structuredResult: null, error: `Model ${modelName} failed: ${e.message || String(e)}`, isChunked: isChunk };
        }
    }

    private async chunkAndMerge<T extends ZodObject<any>>(modelName: typeof Llama4Scout | typeof MistralSmall3_1, fullText: string, schema: T): Promise<StructuredResponse<z.infer<T>>> {
        const chunkSize = this.maxSmallContextChars;
        const textChunks: string[] = [];
        for (let i = 0; i < fullText.length; i += chunkSize) {
            textChunks.push(fullText.substring(i, i + chunkSize));
        }
        const mergedResults: Record<string, any> = {};
        for (let i = 0; i < textChunks.length; i++) {
            const result = await this.executeModel(modelName, textChunks[i], schema, true);
            if (!result.success || !result.structuredResult) {
                return { success: false, modelUsed: modelName, structuredResult: null, error: `Chunking failure on chunk ${i + 1}/${textChunks.length}: ${result.error}`, isChunked: true };
            }
            const currentResult = result.structuredResult;
            for (const key in currentResult) {
                const value = currentResult[key];
                if (Array.isArray(value)) {
                    mergedResults[key] = mergedResults[key] ? [...mergedResults[key], ...value] : value;
                } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    mergedResults[key] = { ...mergedResults[key], ...value };
                } else if (value !== null && value !== undefined) {
                    mergedResults[key] = value;
                }
            }
        }
        const validatedFinal = this.fillMissingFields(schema, mergedResults);
        return { success: true, modelUsed: modelName, structuredResult: validatedFinal, isChunked: true };
    }

    public async analyzeText<T extends ZodObject<any>>(schema: T, textPayload: string): Promise<StructuredResponse<z.infer<T>>> {
        const textCharLength = textPayload.length;
        if (textCharLength > this.maxSmallContextChars) {
            let result = await this.executeModel(Llama4Scout, textPayload, schema);
            if (result.success) return result;
            result = await this.executeModel(MistralSmall3_1, textPayload, schema);
            if (result.success) return result;
            return this.chunkAndMerge(Llama4Scout, textPayload, schema);
        } else {
            let result = await this.executeModel(Hermes2Pro, textPayload, schema);
            if (result.success) return result;
            result = await this.executeModel(MistralSmall3_1, textPayload, schema);
            if (result.success) return result;
            result = await this.executeModel(Llama4Scout, textPayload, schema);
            if (result.success) return result;
            result = await this.executeModel(Llama3_3, textPayload, schema);
            if (result.success) return result;
            return { success: false, modelUsed: Llama3_3, structuredResult: null, error: "All models failed to generate a valid structured response." };
        }
    }
}