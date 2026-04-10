import { Router } from 'express';
import { listSessions, getSessionDetail, searchSessionContent } from '../services/claude-data.js';
import { forkSession } from '../services/forker.js';

const router = Router();

router.get('/search-content', async (req, res) => {
  try {
    const { q } = req.query;
    if (typeof q !== 'string' || !q.trim()) {
      res.json([]);
      return;
    }
    const sessionIds = await searchSessionContent(q.trim());
    res.json(sessionIds);
  } catch (err) {
    console.error('Error searching session content:', err);
    res.status(500).json({ error: 'Failed to search session content' });
  }
});

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

router.post('/:id/fork', async (req, res) => {
  try {
    const { messageUuid } = req.body;
    if (!messageUuid || typeof messageUuid !== 'string') {
      res.status(400).json({ error: 'messageUuid is required' });
      return;
    }
    const result = await forkSession(req.params.id, messageUuid);
    res.json(result);
  } catch (err) {
    console.error('Error forking session:', err);
    const message = err instanceof Error ? err.message : 'Failed to fork session';
    res.status(500).json({ error: message });
  }
});

export default router;
