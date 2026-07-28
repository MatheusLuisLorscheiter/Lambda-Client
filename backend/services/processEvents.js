const subscribers = new Map();
let nextSubscriberId = 0;

const subscribeToProcessEvents = ({ companyId, isAdmin, send }) => {
  const id = ++nextSubscriberId;
  subscribers.set(id, { companyId, isAdmin, send });
  return () => subscribers.delete(id);
};

const publishProcessEvent = ({ companyId, processId = null, type, data = {} }) => {
  const event = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
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

module.exports = { subscribeToProcessEvents, publishProcessEvent };
