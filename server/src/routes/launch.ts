import { Router } from 'express';
import { getResumeCommand } from '../services/launcher.js';

const router = Router();

router.post('/:id/resume', (req, res) => {
  const command = getResumeCommand(req.params.id);
  res.json({ command });
});

export default router;
