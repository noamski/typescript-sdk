import { Transport } from "./shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "./types.js";

/**
 * Browser Context Transport implementation for Model Context Protocol.
 * 
 * Enables client-server communication entirely within the browser environment
 * using the MessageChannel API for bidirectional communication.
 */
export class BrowserContextTransport implements Transport {
  private port: MessagePort;
  private messageCallback?: (message: JSONRPCMessage) => void;
  private closeCallback?: () => void;
  private errorCallback?: (error: Error) => void;
  
  /**
   * Creates a new BrowserContextTransport with the specified MessagePort.
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
   * Creates a pair of connected transports, one for client and one for server.
   * 
   * @returns A tuple containing [clientTransport, serverTransport]
   */
  static createChannelPair(): [BrowserContextTransport, BrowserContextTransport] {
    const channel = new MessageChannel();
    return [
      new BrowserContextTransport(channel.port1),
      new BrowserContextTransport(channel.port2)
    ];
  }
  
  /**
   * Creates a transport that can be used with a Web Worker.
   * 
   * @param worker The Web Worker to communicate with
   * @returns A transport connected to the worker
   */
  static createWorkerTransport(worker: Worker): BrowserContextTransport {
    const channel = new MessageChannel();
    
    // Send port2 to the worker
    worker.postMessage({ type: 'MCP_INIT_PORT' }, [channel.port2]);
    
    // Return a transport using port1
    return new BrowserContextTransport(channel.port1);
  }

  /**
   * Creates a transport that can be used with an iframe.
   * 
   * @param iframe The iframe to communicate with
   * @param targetOrigin The origin to send messages to
   * @returns A transport connected to the iframe
   */
  static createIframeTransport(
    iframe: HTMLIFrameElement,
    targetOrigin: string = '*'
  ): BrowserContextTransport {
    const channel = new MessageChannel();
    
    // Send port2 to the iframe
    iframe.contentWindow?.postMessage({ type: 'MCP_INIT_PORT' }, targetOrigin, [channel.port2]);
    
    // Return a transport using port1
    return new BrowserContextTransport(channel.port1);
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
