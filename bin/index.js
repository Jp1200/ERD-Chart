#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import open from 'open';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Determine project paths
const frontendDistPath = path.join(__dirname, '../frontend/dist');

// CLI Argument parsing
const args = process.argv.slice(2);
const devMode = args.includes('--dev');

// Default file argument if passed (e.g., erd-maker schema.erd.json)
let targetFilePath = null;
const fileArg = args.find(arg => !arg.startsWith('-'));
if (fileArg) {
  targetFilePath = path.resolve(process.cwd(), fileArg);
}

// Endpoint to get configuration (like target file name, etc.)
app.get('/api/config', (req, res) => {
  res.json({
    targetFile: targetFilePath ? path.basename(targetFilePath) : null,
    targetPath: targetFilePath
  });
});

// Endpoint to load diagram JSON
app.get('/api/load', (req, res) => {
  if (!targetFilePath) {
    return res.status(200).json({ tables: [], relationships: [] });
  }
  
  try {
    if (fs.existsSync(targetFilePath)) {
      const content = fs.readFileSync(targetFilePath, 'utf8');
      return res.json(JSON.parse(content));
    } else {
      // File does not exist yet; return empty state
      return res.json({ message: 'File does not exist yet. A new diagram will be created.', tables: [], relationships: [] });
    }
  } catch (error) {
    return res.status(500).json({ error: `Failed to load file: ${error.message}` });
  }
});

// Endpoint to save diagram JSON
app.post('/api/save', (req, res) => {
  const { data, filePath } = req.body;
  const writePath = filePath ? path.resolve(process.cwd(), filePath) : targetFilePath;
  
  if (!writePath) {
    return res.status(400).json({ error: 'No file path specified.' });
  }
  
  try {
    fs.writeFileSync(writePath, JSON.stringify(data, null, 2), 'utf8');
    // If we saved to a new file, update our target path for future saves
    if (!targetFilePath) {
      targetFilePath = writePath;
    }
    return res.json({ success: true, savedPath: writePath });
  } catch (error) {
    return res.status(500).json({ error: `Failed to save file: ${error.message}` });
  }
});

// Endpoint to save SQL DDL export
app.post('/api/save-sql', (req, res) => {
  const { sql, filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'No file path specified for SQL export.' });
  }
  
  try {
    const writePath = path.resolve(process.cwd(), filePath);
    fs.writeFileSync(writePath, sql, 'utf8');
    return res.json({ success: true, savedPath: writePath });
  } catch (error) {
    return res.status(500).json({ error: `Failed to save SQL file: ${error.message}` });
  }
});

// Serve frontend static files in non-dev mode
if (!devMode) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Start server on a free port
const DEFAULT_PORT = 4545;

function startServer(port) {
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n==================================================`);
    console.log(`  ERD Maker running locally!`);
    console.log(`  URL: ${url}`);
    if (targetFilePath) {
      console.log(`  Editing file: ${targetFilePath}`);
    }
    console.log(`==================================================\n`);
    
    // Automatically open browser (except if devMode, since Vite runs its own dev server)
    if (!devMode) {
      open(url).catch(err => {
        console.error('Failed to open browser automatically:', err.message);
      });
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(DEFAULT_PORT);
