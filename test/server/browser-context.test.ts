import { expect } from 'chai';
import * as sinon from 'sinon';
import { BrowserContextServerTransport } from '../../src/server/browser-context.js';
import { MessageType } from '../../src/shared/browser-context-utils.js';

// Mock MessagePort for testing
class MockMessagePort {
  onmessage: ((ev: any) => any) | null = null;
  onmessageerror: ((ev: any) => any) | null = null;
  
  otherPort?: MockMessagePort;
  isClosed = false;
  
  constructor() {
    this.onmessage = null;
    this.onmessageerror = null;
  }
  
  postMessage(message: any): void {
    if (this.isClosed) {
      throw new Error('Port is closed');
    }
    
    if (this.otherPort && this.otherPort.onmessage) {
      const event = {
        data: message,
        ports: [],
        source: this,
        type: 'message'
      };
      
      // Use setTimeout to simulate async behavior
      setTimeout(() => {
        if (this.otherPort?.onmessage) {
          this.otherPort.onmessage(event);
        }
      }, 0);
    }
  }
  
  start(): void {
    // No-op for mock
  }
  
  close(): void {
    this.isClosed = true;
  }
}

// Create a class to mock the global self for worker tests
class MockWorkerGlobalScope {
  private eventListeners: { type: string, listener: EventListener }[] = [];
  
  addEventListener(type: string, listener: EventListener): void {
    this.eventListeners.push({ type, listener });
  }
  
  dispatchEvent(event: any): boolean {
    const listeners = this.eventListeners.filter(e => e.type === event.type);
    listeners.forEach(l => l.listener(event));
    return listeners.length > 0;
  }
}

// Create a class to mock the global window for iframe tests
class MockWindow {
  private eventListeners: { type: string, listener: EventListener }[] = [];
  
  addEventListener(type: string, listener: EventListener): void {
    this.eventListeners.push({ type, listener });
  }
  
  dispatchEvent(event: any): boolean {
    const listeners = this.eventListeners.filter(e => e.type === event.type);
    listeners.forEach(l => l.listener(event));
    return listeners.length > 0;
  }
}

describe('BrowserContextServerTransport', () => {
  let sandbox: sinon.SinonSandbox;
  let serverTransport: BrowserContextServerTransport;
  let mockPort: MockMessagePort;
  let mockClientPort: MockMessagePort;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
    
    // Create a pair of ports for testing
    mockPort = new MockMessagePort();
    mockClientPort = new MockMessagePort();
    
    // Link the ports together
    mockPort.otherPort = mockClientPort;
    mockClientPort.otherPort = mockPort;
    
    // Create the transport with the server port
    serverTransport = new BrowserContextServerTransport(mockPort);
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('basic functionality', () => {
    it('should receive messages from client', (done) => {
      const testMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { hello: 'world' },
        id: 1
      };
      
      serverTransport.onmessage = (message) => {
        expect(message).to.deep.equal(testMessage);
        done();
      };
      
      serverTransport.start();
      mockClientPort.postMessage(testMessage);
    });
    
    it('should send messages to client', (done) => {
      const testMessage = {
        jsonrpc: '2.0',
        result: { success: true },
        id: 1
      };
      
      mockClientPort.onmessage = (event) => {
        expect(event.data).to.deep.equal(testMessage);
        done();
      };
      
      serverTransport.start();
      serverTransport.send(testMessage);
    });
    
    it('should handle close correctly', async () => {
      const closeCallback = sandbox.spy();
      serverTransport.onclose = closeCallback;
      
      await serverTransport.close();
      
      expect(closeCallback.calledOnce).to.be.true;
      expect(mockPort.isClosed).to.be.true;
    });
    
    it('should handle errors correctly', () => {
      const errorCallback = sandbox.spy();
      serverTransport.onerror = errorCallback;
      
      // Trigger a message error
      mockPort.onmessageerror?.({ type: 'messageerror' });
      
      expect(errorCallback.calledOnce).to.be.true;
      expect(errorCallback.firstCall.args[0].message).to.include('MessageError');
    });
  });
  
  describe('listenForConnection', () => {
    let originalSelf: any;
    let mockSelf: MockWorkerGlobalScope;
    
    beforeEach(() => {
      // Save the original self
      originalSelf = (global as any).self;
      
      // Create a mock self
      mockSelf = new MockWorkerGlobalScope();
      (global as any).self = mockSelf;
    });
    
    afterEach(() => {
      // Restore the original self
      (global as any).self = originalSelf;
    });
    
    it('should handle worker message port connection', () => {
      const callbackSpy = sandbox.spy();
      
      // Set up the listener
      BrowserContextServerTransport.listenForConnection(callbackSpy);
      
      // Create a mock message event with a port
      const mockPort = new MockMessagePort();
      const event = {
        type: 'message',
        data: { type: MessageType.INIT },
        ports: [mockPort]
      };
      
      // Dispatch the event
      mockSelf.dispatchEvent(event);
      
      // Check that the callback was called with a transport
      expect(callbackSpy.calledOnce).to.be.true;
      expect(callbackSpy.firstCall.args[0]).to.be.instanceOf(BrowserContextServerTransport);
    });
  });
  
  describe('listenForIframeConnection', () => {
    let originalWindow: any;
    let mockWindow: MockWindow;
    
    beforeEach(() => {
      // Save the original window
      originalWindow = (global as any).window;
      
      // Create a mock window
      mockWindow = new MockWindow();
      (global as any).window = mockWindow;
    });
    
    afterEach(() => {
      // Restore the original window
      (global as any).window = originalWindow;
    });
    
    it('should handle iframe message port connection', () => {
      const callbackSpy = sandbox.spy();
      
      // Set up the listener
      BrowserContextServerTransport.listenForIframeConnection(callbackSpy);
      
      // Create a mock message event with a port
      const mockPort = new MockMessagePort();
      const event = {
        type: 'message',
        data: { type: MessageType.INIT },
        ports: [mockPort],
        origin: 'https://example.com'
      };
      
      // Dispatch the event
      mockWindow.dispatchEvent(event);
      
      // Check that the callback was called with a transport
      expect(callbackSpy.calledOnce).to.be.true;
      expect(callbackSpy.firstCall.args[0]).to.be.instanceOf(BrowserContextServerTransport);
    });
    
    it('should respect the target origin when specified', () => {
      const callbackSpy = sandbox.spy();
      
      // Set up the listener with a specific origin
      BrowserContextServerTransport.listenForIframeConnection(callbackSpy, 'https://allowed.com');
      
      // Create a mock message event with a port but from wrong origin
      const mockPort = new MockMessagePort();
      const event = {
        type: 'message',
        data: { type: MessageType.INIT },
        ports: [mockPort],
        origin: 'https://different.com'
      };
      
      // Dispatch the event
      mockWindow.dispatchEvent(event);
      
      // Check that the callback was not called
      expect(callbackSpy.called).to.be.false;
      
      // Now try with the correct origin
      const goodEvent = {
        type: 'message',
        data: { type: MessageType.INIT },
        ports: [mockPort],
        origin: 'https://allowed.com'
      };
      
      // Dispatch the good event
      mockWindow.dispatchEvent(goodEvent);
      
      // Check that the callback was called
      expect(callbackSpy.calledOnce).to.be.true;
    });
  });
});
