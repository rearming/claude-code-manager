import { Router } from 'express';
import {
  getResumeCommand,
  streamMessage,
  streamNewSession,
  getActiveProcesses,
  killSessionProcess,
  getSessionStatus,
  subscribeToSession,
} from '../services/launcher.js';

const router = Router();

// Debug: list active persistent processes
router.get('/processes', (_req, res) => {
  res.json(getActiveProcesses());
});

// Kill a session's persistent process
router.delete('/:id/process', (req, res) => {
  const killed = killSessionProcess(req.params.id);
  res.json({ killed });
});

// Check if a session is currently streaming
router.get('/:id/status', (req, res) => {
  res.json(getSessionStatus(req.params.id));
});

// Subscribe to an already-streaming session (reconnect after page reload)
router.get('/:id/subscribe', (req, res) => {
  const attached = subscribeToSession(req.params.id, res);
  if (!attached) {
    res.status(204).end();
  }
});

router.post('/new', async (req, res) => {
  try {
    const { message, projectPath, dangerouslySkipPermissions, images, model, reasoningEffort } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    await streamNewSession(message, projectPath, res, {
      dangerouslySkipPermissions: !!dangerouslySkipPermissions,
      model: model || undefined,
      reasoningEffort: reasoningEffort || undefined,
    }, images);
  } catch (err) {
    console.error('Error creating new session:', err);
    const msg = err instanceof Error ? err.message : 'Failed to create session';
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
});

router.post('/:id/resume', (req, res) => {
  const command = getResumeCommand(req.params.id);
  res.json({ command });
});

router.post('/:id/send', async (req, res) => {
  try {
    const { message, dangerouslySkipPermissions, images, model, reasoningEffort } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    await streamMessage(req.params.id, message, res, {
      dangerouslySkipPermissions: !!dangerouslySkipPermissions,
      model: model || undefined,
      reasoningEffort: reasoningEffort || undefined,
    }, images);
  } catch (err) {
    console.error('Error sending message:', err);
    const msg = err instanceof Error ? err.message : 'Failed to send message';
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
});

export default router;
