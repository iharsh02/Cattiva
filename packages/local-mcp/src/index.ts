import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

function createServer(): McpServer {
    const server = new McpServer(
        {
            name: 'memory-engine',
            version: '1.0.0',
        },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        'add_memory',
        {
            title: 'Add memory',
            description: 'Store a fact in the memory engine.',
            inputSchema: z.object({
                content: z.string().describe('The fact to remember'),
                metadata: z
                    .record(z.string(), z.unknown())
                    .optional()
                    .describe('Optional arbitrary metadata to attach to the memory'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async ({ content, metadata }) => {
            // TODO: persist to the memory store and return the generated id
            return {
                content: [
                    {
                        type: 'text',
                        text: `Stored: ${content}${metadata ? ` ${JSON.stringify(metadata)}` : ''}`,
                    },
                ],
            };
        },
    );

    server.registerTool(
        'retrieve_memory',
        {
            title: 'Retrieve memory',
            description: 'Semantic search over stored memories.',
            inputSchema: z.object({
                query: z.string().describe('The query to search for'),
                top_k: z
                    .number()
                    .int()
                    .positive()
                    .default(5)
                    .describe('Maximum number of memories to return'),
            }),
            annotations: { readOnlyHint: true },
        },
        async ({ query, top_k }) => {
            // TODO: embed the query and run a similarity search against the store
            return {
                content: [
                    {
                        type: 'text',
                        text: `Top ${top_k} results for: ${query}`,
                    },
                ],
            };
        },
    );

    server.registerTool(
        'update_memory',
        {
            title: 'Update memory',
            description: 'Replace the content of an existing memory.',
            inputSchema: z.object({
                id: z.string().describe('Id of the memory to update'),
                content: z.string().describe('The new content to replace it with'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async ({ id, content }) => {
            // TODO: look up `id`, re-embed the new content, and write it back
            return {
                content: [
                    {
                        type: 'text',
                        text: `Updated ${id}: ${content}`,
                    },
                ],
            };
        },
    );

    server.registerTool(
        'delete_memory',
        {
            title: 'Delete memory',
            description: 'Remove a memory from the store.',
            inputSchema: z.object({
                id: z.string().describe('Id of the memory to delete'),
            }),
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
        },
        async ({ id }) => {
            // TODO: delete from the memory store
            return {
                content: [
                    {
                        type: 'text',
                        text: `Deleted ${id}`,
                    },
                ],
            };
        },
    );

    return server;
}

serveStdio(createServer);
