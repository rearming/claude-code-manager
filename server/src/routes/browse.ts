import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const router = Router();

/**
 * GET /api/browse?path=...
 * Lists subdirectories of a given path. Returns drives on Windows if no path given.
 */
router.get('/', async (req, res) => {
  try {
    let dirPath = typeof req.query.path === 'string' ? req.query.path : '';

    // Default to home directory
    if (!dirPath) {
      dirPath = os.homedir();
    }

    // Normalize the path
    dirPath = path.resolve(dirPath);

    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        // Skip hidden dirs and node_modules
        if (e.name.startsWith('.') || e.name === 'node_modules') return false;
        return true;
      })
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      current: dirPath,
      parent: path.dirname(dirPath) !== dirPath ? path.dirname(dirPath) : null,
      dirs,
    });
  } catch (err) {
    console.error('Error browsing directory:', err);
    res.status(400).json({ error: 'Cannot read directory' });
  }
});

export default router;
