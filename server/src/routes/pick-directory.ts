import { Router } from 'express';
import { execFile } from 'node:child_process';
import os from 'node:os';

const router = Router();

/**
 * POST /api/pick-directory
 * Opens a native OS folder picker dialog and returns the selected path.
 * Body: { startPath?: string }
 */
router.post('/', async (req, res) => {
  const startPath =
    typeof req.body?.startPath === 'string' ? req.body.startPath : os.homedir();

  const platform = process.platform;

  try {
    let selected: string | null = null;

    if (platform === 'win32') {
      selected = await pickWindows(startPath);
    } else if (platform === 'darwin') {
      selected = await pickMac(startPath);
    } else {
      selected = await pickLinux(startPath);
    }

    if (selected) {
      res.json({ path: selected });
    } else {
      res.json({ path: null });
    }
  } catch (err) {
    console.error('pick-directory error:', err);
    res.status(500).json({ error: 'Failed to open directory picker' });
  }
});

function pickWindows(startPath: string): Promise<string | null> {
  // Use PowerShell with Windows Forms FolderBrowserDialog
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select project directory"
$dialog.SelectedPath = "${startPath.replace(/\\/g, '\\\\').replace(/"/g, '`"')}"
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 120000,
    }, (err, stdout) => {
      if (err) return reject(err);
      const path = stdout.trim();
      resolve(path || null);
    });
  });
}

function pickMac(startPath: string): Promise<string | null> {
  const script = `POSIX path of (choose folder default location POSIX file "${startPath}" with prompt "Select project directory")`;
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], { timeout: 120000 }, (err, stdout) => {
      if (err) {
        // User cancelled
        if (err.message?.includes('-128')) return resolve(null);
        return reject(err);
      }
      resolve(stdout.trim() || null);
    });
  });
}

function pickLinux(startPath: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile('zenity', ['--file-selection', '--directory', `--filename=${startPath}/`, '--title=Select project directory'], {
      timeout: 120000,
    }, (err, stdout) => {
      if (err) {
        // User cancelled (exit code 1)
        if ((err as NodeJS.ErrnoException).code === '1' || err.message?.includes('exit code 1')) {
          return resolve(null);
        }
        return reject(err);
      }
      resolve(stdout.trim() || null);
    });
  });
}

export default router;
