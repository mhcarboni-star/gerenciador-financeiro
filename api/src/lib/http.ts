import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

type Handler = (req: any, res: Response, next: NextFunction) => Promise<unknown>;

/** Encaminha erros de handlers assíncronos para o middleware de erro. */
export const ah = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res, next).catch(next);

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const flat = err.flatten();
    // Regras que envolvem mais de um campo (refine) vêm em formErrors.
    return res.status(400).json({ error: flat.formErrors[0] ?? "Dados inválidos", details: flat.fieldErrors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno" });
}
