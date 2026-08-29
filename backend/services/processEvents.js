const subscribers = new Map();
const { enqueueGenericWebhookEvent } = require('./genericWebhookPublisher');
let nextSubscriberId = 0;

const subscribeToProcessEvents = ({ companyId, isAdmin, send }) => {
  const id = ++nextSubscriberId;
  subscribers.set(id, { companyId, isAdmin, send });
  return () => subscribers.delete(id);
};

const emitProcessEvent = ({ companyId, processId = null, type, data = {}, eventId = null }) => {
  const event = {
    id: eventId || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    companyId,
    processId,
    type,
    data,
    occurredAt: new Date().toISOString()
  };
  for (const subscriber of subscribers.values()) {
    if (subscriber.isAdmin || subscriber.companyId === companyId) {
      try {
        subscriber.send(event);
      } catch {
        // The response close handler removes disconnected subscribers.
      }
    }
  }
  return event;
};

const webhookPayload = (event) => ({
  companyId: event.companyId,
  eventId: event.id,
  type: event.type,
  occurredAt: event.occurredAt,
  subject: { type: event.processId ? 'process' : 'company', id: String(event.processId || event.companyId) },
  data: { processId: event.processId, ...event.data }
});

const publishProcessEvent = (input) => {
  const event = emitProcessEvent(input);
  enqueueGenericWebhookEvent(webhookPayload(event)).catch(error => console.error('[Generic webhook outbox]', error.message));
  return event;
};

const publishDurableProcessEvent = async (input) => {
  const event = emitProcessEvent(input);
  await enqueueGenericWebhookEvent(webhookPayload(event));
  return event;
};

module.exports = { subscribeToProcessEvents, publishProcessEvent, publishDurableProcessEvent };
