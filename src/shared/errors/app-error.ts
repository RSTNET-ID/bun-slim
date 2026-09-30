export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_SERVER_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', details?: unknown) {
    super(message, 404, 'RESOURCE_NOT_FOUND', details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict detected', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}
