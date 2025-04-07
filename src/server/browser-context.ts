import { Transport } from "../shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "../types.js";
import { MessageType } from "../shared/browser-context-utils.js";

/**
 * Browser Context Transport server implementation for Model Context Protocol.
 * 
 * Enables client-server communication entirely within the browser environment
 * using the MessageChannel API for bidirectional communication.
 */
export class BrowserContextServerTransport implements Transport {
  private port: MessagePort;
  private messageCallback?: (message: JSONRPCMessage) => void;
  private closeCallback?: () => void;
  private errorCallback?: (error: Error) => void;
  
  /**
   * Creates a new BrowserContextServerTransport with the specified MessagePort.
   * 
   * @param port A MessagePort for communication
   */
  constructor(port: MessagePort) {
    this.port = port;
    
    // Set up event listeners
    this.port.onmessage = this.handleMessage.bind(this);
    this.port.onmessageerror = this.handleError.bind(this);
  }
  
  /**
   * Helper for Web Worker server-side setup.
   * 
   * This method should be called inside a Web Worker to receive
   * and handle the MessagePort sent from the client.
   * 
   * @param callback Function that will receive the server transport
   * @example
   * // Inside a Web Worker
   * import { BrowserContextServerTransport } from "@modelcontextprotocol/sdk/server/browser-context.js";
   * 
   * BrowserContextServerTransport.listenForConnection((transport) => {
   *   const server = new McpServer({ ... });
   *   server.connect(transport);
   * });
   */
  static listenForConnection(
    callback: (transport: BrowserContextServerTransport) => void
  ): void {
    self.addEventListener('message', (event) => {
      if (event.data?.type === MessageType.INIT) {
        if (event.ports.length > 0) {
          const port = event.ports[0];
          const transport = new BrowserContextServerTransport(port);
          callback(transport);
        }
      }
    });
  }
  
  /**
   * Helper for iframe server-side setup.
   * 
   * This method should be called inside an iframe to receive
   * and handle the MessagePort sent from the parent window.
   * 
   * @param callback Function that will receive the server transport
   * @param targetOrigin Optional origin to restrict messages from
   * @example
   * // Inside an iframe
   * import { BrowserContextServerTransport } from "@modelcontextprotocol/sdk/server/browser-context.js";
   * 
   * BrowserContextServerTransport.listenForIframeConnection((transport) => {
   *   const server = new McpServer({ ... });
   *   server.connect(transport);
   * });
   */
  static listenForIframeConnection(
    callback: (transport: BrowserContextServerTransport) => void,
    targetOrigin?: string
  ): void {
    window.addEventListener('message', (event) => {
      if (targetOrigin && event.origin !== targetOrigin) {
        return;
      }
      
      if (event.data?.type === MessageType.INIT) {
        if (event.ports.length > 0) {
          const port = event.ports[0];
          const transport = new BrowserContextServerTransport(port);
          callback(transport);
        }
      }
    });
  }
  
  /**
   * Starts the transport and enables message reception.
   */
  async start(): Promise<void> {
    this.port.start();
  }
  
  /**
   * Sends a message through the transport.
   * 
   * @param message The message to send
   */
  async send(message: JSONRPCMessage): Promise<void> {
    this.port.postMessage(message);
  }
  
  /**
   * Closes the transport and releases resources.
   */
  async close(): Promise<void> {
    this.port.close();
    if (this.closeCallback) {
      this.closeCallback();
    }
  }
  
  /**
   * Handles incoming messages from the other end of the transport.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSONRPCMessageSchema.parse(event.data);
      if (this.messageCallback) {
        this.messageCallback(message);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Handles errors in the transport.
   */
  private handleError(error: Error | MessageEvent): void {
    const err = error instanceof MessageEvent ? 
      new Error(`MessageError: ${error.type}`) : 
      error;
    
    if (this.errorCallback) {
      this.errorCallback(err);
    }
  }
  
  // Transport interface implementation
  set onmessage(callback: ((message: JSONRPCMessage) => void) | undefined) {
    this.messageCallback = callback;
  }
  
  set onclose(callback: (() => void) | undefined) {
    this.closeCallback = callback;
  }
  
  set onerror(callback: ((error: Error) => void) | undefined) {
    this.errorCallback = callback;
  }
}
