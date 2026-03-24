import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const router = Router();

const CACHE_DIR = path.join(os.homedir(), '.claude-code-manager', 'cache', 'images');

const EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/**
 * POST /api/images - Cache an image
 */
router.post('/', async (req, res) => {
  try {
    const { data, mediaType, sessionId, messageUuid } = req.body;
    if (!data || !mediaType) {
      res.status(400).json({ error: 'Missing data or mediaType' });
      return;
    }

    const ext = EXT_MAP[mediaType];
    if (!ext) {
      res.status(400).json({ error: 'Unsupported mediaType' });
      return;
    }

    await ensureCacheDir();

    const buffer = Buffer.from(data, 'base64');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const filePath = path.join(CACHE_DIR, hash + ext);
    const metaPath = path.join(CACHE_DIR, hash + '.meta.json');

    // Write file only if it doesn't already exist
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, buffer);
      await fs.writeFile(
        metaPath,
        JSON.stringify({ hash, mediaType, sessionId, messageUuid, createdAt: new Date().toISOString() }),
      );
    }

    res.json({ hash, mediaType });
  } catch (err) {
    console.error('Error caching image:', err);
    res.status(500).json({ error: 'Failed to cache image' });
  }
});

/**
 * GET /api/images/:hash - Serve a cached image
 */
router.get('/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const metaPath = path.join(CACHE_DIR, hash + '.meta.json');

    let meta: { mediaType: string };
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    } catch {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const ext = EXT_MAP[meta.mediaType];
    if (!ext) {
      res.status(404).json({ error: 'Image not found' });
      return;
    }

    const filePath = path.join(CACHE_DIR, hash + ext);
    const buffer = await fs.readFile(filePath);
    res.set('Content-Type', meta.mediaType);
    res.send(buffer);
  } catch (err) {
    console.error('Error serving image:', err);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

/**
 * POST /api/images/annotated - Save an annotated version
 */
router.post('/annotated', async (req, res) => {
  try {
    const { data, mediaType, originalHash } = req.body;
    if (!data || !mediaType || !originalHash) {
      res.status(400).json({ error: 'Missing data, mediaType, or originalHash' });
      return;
    }

    const ext = EXT_MAP[mediaType];
    if (!ext) {
      res.status(400).json({ error: 'Unsupported mediaType' });
      return;
    }

    await ensureCacheDir();

    const buffer = Buffer.from(data, 'base64');
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const filePath = path.join(CACHE_DIR, hash + ext);
    const metaPath = path.join(CACHE_DIR, hash + '.meta.json');

    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, buffer);
      await fs.writeFile(
        metaPath,
        JSON.stringify({ hash, mediaType, originalHash, createdAt: new Date().toISOString() }),
      );
    }

    res.json({ hash });
  } catch (err) {
    console.error('Error caching annotated image:', err);
    res.status(500).json({ error: 'Failed to cache annotated image' });
  }
});

export default router;
