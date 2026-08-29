const express = require('express');
const { authenticateToken } = require('./auth');
const { listWebhookEndpoints, createWebhookEndpoint, updateWebhookEndpoint, rotateWebhookSecret, enqueueGenericWebhookEvent, dispatchPendingWebhookEvents } = require('../services/genericWebhookPublisher');

const router = express.Router();
function admin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Acesso de administrador obrigatório' }); next(); }
function companyId(req) { return Number(req.params.companyId || req.body.companyId); }

router.get('/:companyId', authenticateToken, admin, async (req, res) => { try { res.json({ endpoints: await listWebhookEndpoints(companyId(req)) }); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });
router.post('/', authenticateToken, admin, async (req, res) => { try { const id = companyId(req); if (!Number.isInteger(id) || id <= 0) throw new Error('Empresa inválida.'); res.status(201).json(await createWebhookEndpoint({ companyId: id, name: req.body.name, url: req.body.url, eventTypes: req.body.eventTypes, signatureHeader: req.body.signatureHeader, timestampHeader: req.body.timestampHeader })); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });
router.patch('/:companyId/:endpointId', authenticateToken, admin, async (req, res) => { try { res.json({ endpoint: await updateWebhookEndpoint(companyId(req), Number(req.params.endpointId), req.body || {}) }); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });
router.delete('/:companyId/:endpointId', authenticateToken, admin, async (req, res) => { try { res.json({ endpoint: await updateWebhookEndpoint(companyId(req), Number(req.params.endpointId), { isActive: false }) }); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });
router.post('/:companyId/:endpointId/rotate-secret', authenticateToken, admin, async (req, res) => { try { res.json(await rotateWebhookSecret(companyId(req), Number(req.params.endpointId))); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });
router.post('/:companyId/:endpointId/test', authenticateToken, admin, async (req, res) => { try { const id = companyId(req); const endpointId = Number(req.params.endpointId); const endpoints = await listWebhookEndpoints(id); if (!endpoints.some(item => Number(item.id) === endpointId)) return res.status(404).json({ error: 'Endpoint não encontrado.' }); const event = await enqueueGenericWebhookEvent({ companyId: id, endpointId, type: 'webhook.test', subject: { type: 'webhook-endpoint', id: String(endpointId) }, data: { requestedBy: req.user.id } }); await dispatchPendingWebhookEvents(10); res.status(202).json({ accepted: true, event }); } catch (error) { res.status(error.status || 400).json({ error: error.message }); } });

module.exports = router;
