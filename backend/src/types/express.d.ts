import "express";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      username?: string | null;
    }

    interface Request {
      user?: User;
    }
  }
}
