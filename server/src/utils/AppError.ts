export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code = 'BAD_REQUEST') {
    return new AppError(message, 400, code);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static conflict(message: string) {
    return new AppError(message, 409, 'CONFLICT');
  }

  static validation(message: string, details?: any) {
    const err = new AppError(message, 400, 'VALIDATION_ERROR');
    (err as any).details = details;
    return err;
  }
}
