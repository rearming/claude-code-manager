import { Router } from 'express';
import { listSessions, getSessionDetail } from '../services/claude-data.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const sessions = await listSessions();

    const { project, search } = _req.query;
    let filtered = sessions;

    if (typeof project === 'string' && project) {
      filtered = filtered.filter((s) => s.projectName === project || s.project === project);
    }

    if (typeof search === 'string' && search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.firstMessage.toLowerCase().includes(q) ||
          (s.slug && s.slug.toLowerCase().includes(q)) ||
          s.sessionId.includes(q)
      );
    }

    res.json(filtered);
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const detail = await getSessionDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

export default router;
