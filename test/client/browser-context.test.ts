import { expect } from 'chai';
import * as sinon from 'sinon';
import { BrowserContextClientTransport } from '../../src/client/browser-context.js';

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

describe('BrowserContextClientTransport', () => {
  let sandbox: sinon.SinonSandbox;
  
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  
  afterEach(() => {
    sandbox.restore();
  });
  
  describe('createClientServerPair', () => {
    it('should create a client transport and server port', () => {
      const [clientTransport, serverPort] = BrowserContextClientTransport.createClientServerPair();
      
      expect(clientTransport).to.be.instanceOf(BrowserContextClientTransport);
      expect(serverPort).to.be.instanceOf(MockMessagePort);
    });
  });
  
  describe('message passing', () => {
    it('should send and receive messages', (done) => {
      const [clientTransport, serverPort] = BrowserContextClientTransport.createClientServerPair();
      
      const testMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { hello: 'world' },
        id: 1
      };
      
      // Set up server side to echo messages back
      (serverPort as MockMessagePort).onmessage = (event) => {
        expect(event.data).to.deep.equal(testMessage);
        serverPort.postMessage(event.data);
      };
      
      // Set up client to receive the echo
      clientTransport.onmessage = (message) => {
        expect(message).to.deep.equal(testMessage);
        done();
      };
      
      // Start transport
      clientTransport.start();
      
      // Send message from client
      clientTransport.send(testMessage);
    });
    
    it('should handle invalid messages gracefully', () => {
      const [clientTransport] = BrowserContextClientTransport.createClientServerPair();
      
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
      const [clientTransport] = BrowserContextClientTransport.createClientServerPair();
      
      const closeSpy = sandbox.spy();
      clientTransport.onclose = closeSpy;
      
      await clientTransport.close();
      
      expect(closeSpy.calledOnce).to.be.true;
    });
  });
  
  describe('error handling', () => {
    it('should call the onerror callback when an error occurs', () => {
      const [clientTransport] = BrowserContextClientTransport.createClientServerPair();
      
      const errorSpy = sandbox.spy();
      clientTransport.onerror = errorSpy;
      
      // Directly access the internal port to trigger an error
      const mockPort = (clientTransport as any).port as MockMessagePort;
      
      // Trigger a messageerror
      mockPort.onmessageerror?.({ type: 'messageerror' });
      
      expect(errorSpy.calledOnce).to.be.true;
      expect(errorSpy.firstCall.args[0].message).to.include('MessageError');
    });
  });
});
