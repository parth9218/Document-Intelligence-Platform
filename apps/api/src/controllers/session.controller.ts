import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors/app-error';

class SessionController {
  /**
   * Retrieves detail parameters of the active session.
   */
  public getActiveSession(req: Request, res: Response, next: NextFunction): void {
    if (!req.session) {
      return next(new UnauthorizedError('No active session'));
    }

    res.status(200).json({
      id: req.session.id,
      expires_at: req.session.expires_at,
      created_at: req.session.created_at,
    });
  }
}

export const sessionController = new SessionController();
