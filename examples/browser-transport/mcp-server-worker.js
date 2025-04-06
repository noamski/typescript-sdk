// Web Worker for MCP Server

// Note: In a real application, you would import from the actual MCP SDK
// This example assumes you've bundled the SDK with tools like webpack or vite
// For simplicity, we're using placeholder imports here
import { McpServer } from './mcp-server.js';
import { BrowserContextTransport } from './browser-context-transport.js';
import { z } from './zod.js';

// Helper to log messages back to the main thread
function log(message) {
    self.postMessage({ type: 'log', message });
}

// Listen for the initialization message containing the MessagePort
self.addEventListener('message', async (event) => {
    if (event.data?.type === 'MCP_INIT_PORT') {
        log('Worker received initialization message with port');

        // Extract the port from the event
        const port = event.ports[0];

        // Create the MCP server
        log('Creating MCP server in worker');
        const server = new McpServer({
            name: "worker-server",
            version: "1.0.0"
        });

        // Register tools
        log('Registering tools');
        
        // Greeting tool
        server.tool(
            "greet",
            { name: z.string() },
            async ({ name }) => {
                log(`Executing greet tool with name="${name}"`);
                return {
                    content: [{ 
                        type: "text", 
                        text: `Hello, ${name}! This message comes from a Web Worker.` 
                    }]
                };
            }
        );

        // Calculator tool
        server.tool(
            "calculate",
            {
                a: z.number(),
                b: z.number(),
                operation: z.enum(["add", "subtract", "multiply", "divide"])
            },
            async ({ a, b, operation }) => {
                log(`Executing calculate tool with a=${a}, b=${b}, operation=${operation}`);
                
                let result;
                switch (operation) {
                    case "add":
                        result = a + b;
                        break;
                    case "subtract":
                        result = a - b;
                        break;
                    case "multiply":
                        result = a * b;
                        break;
                    case "divide":
                        if (b === 0) {
                            return {
                                content: [{ type: "text", text: "Error: Division by zero" }],
                                isError: true
                            };
                        }
                        result = a / b;
                        break;
                }

                return {
                    content: [{ 
                        type: "text", 
                        text: `Result of ${a} ${operation} ${b} = ${result}` 
                    }]
                };
            }
        );

        // Create transport with the port
        log('Creating BrowserContextTransport with MessagePort');
        const transport = new BrowserContextTransport(port);

        // Connect the server to the transport
        log('Connecting server to transport');
        await server.connect(transport);

        log('Worker setup complete');
    }
});

// Log that the worker script has loaded
log('Worker script loaded');
