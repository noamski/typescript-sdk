/**
 * Shared utilities for browser context transport implementations
 */

/**
 * Creates a connected pair of MessagePort objects
 */
export function createMessageChannelPair(): [MessagePort, MessagePort] {
  const channel = new MessageChannel();
  return [channel.port1, channel.port2];
}

/**
 * Types of special messages for browser context transport
 */
export enum MessageType {
  INIT = 'MCP_INIT_PORT',
}
