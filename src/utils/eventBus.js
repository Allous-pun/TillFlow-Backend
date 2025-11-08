import { EventEmitter } from 'events';

/**
 * Central event bus for application-wide event publishing/subscribing
 * @class AppEventEmitter
 * @extends EventEmitter
 */
class AppEventEmitter extends EventEmitter {}

// Create singleton instance
const eventBus = new AppEventEmitter();

// Set max listeners to avoid memory leak warnings
eventBus.setMaxListeners(20);

// Export singleton instance
export default eventBus;