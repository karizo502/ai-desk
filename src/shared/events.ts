/**
 * AI_DESK — Event Emitter
 *
 * Type-safe event bus for gateway lifecycle events.
 */
import { EventEmitter } from 'node:events';
import type { GatewayEvent } from './types.js';

interface EventData {
  event: GatewayEvent;
  timestamp: number;
  data: Record<string, unknown>;
}

export class GatewayEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Increase limit — gateway has many listeners
    this.emitter.setMaxListeners(100);
  }

  emit(event: GatewayEvent, data: Record<string, unknown> = {}): void {
    const payload: EventData = {
      event,
      timestamp: Date.now(),
      data,
    };
    this.emitter.emit(event, payload);
    // Also emit on wildcard for audit log
    this.emitter.emit('*', payload);
  }

  on(event: GatewayEvent | '*', handler: (data: EventData) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: GatewayEvent | '*', handler: (data: EventData) => void): void {
    this.emitter.off(event, handler);
  }

  once(event: GatewayEvent, handler: (data: EventData) => void): void {
    this.emitter.once(event, handler);
  }
}

/** Singleton event bus */
export const eventBus = new GatewayEventBus();
