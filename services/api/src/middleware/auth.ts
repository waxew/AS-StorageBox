import type { NextFunction, Request, Response } from 'express';
import { jwtVerify } from 'jose';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  auth?: { subject: string };
}

const secret = new TextEncoder().encode(config.JWT_SECRET);

// Authentication only establishes identity. Resource authorization is performed
// separately for every file/folder/share operation to avoid confused-deputy bugs.
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }

  try {
    const token = header.slice('Bearer '.length);
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return res.status(401).json({ error: 'INVALID_TOKEN' });
    req.auth = { subject: payload.sub };
    next();
  } catch {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}
