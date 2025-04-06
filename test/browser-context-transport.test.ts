import { expect } from 'chai';
import { BrowserContextTransport } from '../src/browser-context-transport.js';
import * as sinon from 'sinon';

// Mock MessageChannel, MessagePort and MessageEvent for testing in Node.js environment
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

class MockMessageChannel {
  port1: MockMessagePort;
  port2: MockMessagePort;
  
  constructor() {
    this.port1 = new MockMessagePort();
    this.port2 = new MockMessagePort();
    
    // Link the ports to each other
    this.port1.otherPort = this.port2;
    this.port2.otherPort = this.port1;
  }
}

// Replace global MessageChannel with our mock version
(global as any).MessageChannel = MockMessageChannel;
// Replace global MessagePort with our mock version (for type checking)
(global as any).MessagePort = MockMessagePort;

describe('BrowserContextTransport', () => {
  let sandbox: sinon.SinonSandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('createChannelPair', () => {
    it('should create a pair of connected transports', () => {
      const [clientTransport, serverTransport] = BrowserContextTransport.createChannelPair();
      
      expect(clientTransport).to.be.instanceOf(BrowserContextTransport);
      expect(serverTransport).to.be.instanceOf(BrowserContextTransport);
    });
  });
  
  describe('message passing', () => {
    it('should send and receive messages between transports', (done) => {
      const [clientTransport, serverTransport] = BrowserContextTransport.createChannelPair();
      
      const testMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { hello: 'world' },
        id: 1
      };
      
      // Set up server to echo messages back
      serverTransport.onmessage = (message) => {
        expect(message).to.deep.equal(testMessage);
        serverTransport.send(message);
      };
      
      // Set up client to receive the echo
      clientTransport.onmessage = (message) => {
        expect(message).to.deep.equal(testMessage);
        done();
      };
      
      // Start transports
      clientTransport.start();
      serverTransport.start();
      
      // Send message from client
      clientTransport.send(testMessage);
    });
    
    it('should handle invalid messages gracefully', () => {
      const [clientTransport, serverTransport] = BrowserContextTransport.createChannelPair();
      
      const errorSpy = sandbox.spy();
      clientTransport.onerror = errorSpy;
      
      // Directly access the internal port to bypass validation
      const mockPort = (clientTransport as any).port as MockMessagePort;
      
      // Trigger an invalid message
      mockPort.onmessage?.({ data: 'not a valid JSONRPC message' });
      
      expect(errorSpy.called).to.be.true;
    });
  });
  
  describe('close', () => {
    it('should close the transport and call the onclose callback', async () => {
      const transport = BrowserContextTransport.createChannelPair()[0];
      
      const closeSpy = sandbox.spy();
      transport.onclose = closeSpy;
      
      await transport.close();
      
      expect(closeSpy.calledOnce).to.be.true;
    });
  });
  
  describe('error handling', () => {
    it('should call the onerror callback when an error occurs', () => {
      const transport = BrowserContextTransport.createChannelPair()[0];
      
      const errorSpy = sandbox.spy();
      transport.onerror = errorSpy;
      
      // Directly access the internal port to trigger an error
      const mockPort = (transport as any).port as MockMessagePort;
      
      // Trigger a messageerror
      mockPort.onmessageerror?.({ type: 'messageerror' });
      
      expect(errorSpy.calledOnce).to.be.true;
      expect(errorSpy.firstCall.args[0].message).to.include('MessageError');
    });
  });
});
