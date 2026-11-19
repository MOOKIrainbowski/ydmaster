// 로컬 개발 서버: Vercel 과 같은 모양(정적 public/ + /api)으로 띄운다. 운영에는 쓰이지 않음.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const local = express();
local.use(app);
local.use(express.static(root, { extensions: ['html'] }));
const port = process.env.PORT || 5000;
local.listen(port, () => console.log(`영단마스터 로컬 서버 http://localhost:${port}`));
