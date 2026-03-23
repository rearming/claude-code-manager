import { Router } from 'express';
import { getResumeCommand, sendMessage } from '../services/launcher.js';

const router = Router();

router.post('/:id/resume', (req, res) => {
  const command = getResumeCommand(req.params.id);
  res.json({ command });
});

router.post('/:id/send', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }
    const result = await sendMessage(req.params.id, message);
    res.json(result);
  } catch (err) {
    console.error('Error sending message:', err);
    const msg = err instanceof Error ? err.message : 'Failed to send message';
    res.status(500).json({ error: msg });
  }
});

export default router;
