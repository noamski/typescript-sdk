import { Transport } from "../shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "../types.js";
import { createMessageChannelPair, MessageType } from "../shared/browser-context-utils.js";

/**
 * Browser Context Transport client implementation for Model Context Protocol.
 * 
 * Enables client-server communication entirely within the browser environment
 * using the MessageChannel API for bidirectional communication.
 */
export class BrowserContextClientTransport implements Transport {
  private port: MessagePort;
  private messageCallback?: (message: JSONRPCMessage) => void;
  private closeCallback?: () => void;
  private errorCallback?: (error: Error) => void;
  
  /**
   * Creates a new BrowserContextClientTransport with the specified MessagePort.
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
   * Creates a transport pair for client and server communication.
   * 
   * @returns A tuple containing [clientTransport, serverPort]
   */
  static createClientServerPair(): [BrowserContextClientTransport, MessagePort] {
    const [clientPort, serverPort] = createMessageChannelPair();
    return [new BrowserContextClientTransport(clientPort), serverPort];
  }
  
  /**
   * Creates a transport that can be used with a Web Worker.
   * 
   * @param worker The Web Worker to communicate with
   * @returns A transport connected to the worker
   */
  static connectToWorker(worker: Worker): BrowserContextClientTransport {
    const [clientPort, serverPort] = createMessageChannelPair();
    
    // Send port2 to the worker
    worker.postMessage({ type: MessageType.INIT }, [serverPort]);
    
    // Return a transport using port1
    return new BrowserContextClientTransport(clientPort);
  }

  /**
   * Creates a transport that can be used with an iframe.
   * 
   * @param iframe The iframe to communicate with
   * @param targetOrigin The origin to send messages to
   * @returns A transport connected to the iframe
   */
  static connectToIframe(
    iframe: HTMLIFrameElement,
    targetOrigin: string = '*'
  ): BrowserContextClientTransport {
    const [clientPort, serverPort] = createMessageChannelPair();
    
    // Send port2 to the iframe
    iframe.contentWindow?.postMessage({ type: MessageType.INIT }, targetOrigin, [serverPort]);
    
    // Return a transport using port1
    return new BrowserContextClientTransport(clientPort);
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
