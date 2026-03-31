export const ERROR_CODES = {
    PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
    PROJECT_ALREADY_RUNNING: 'PROJECT_ALREADY_RUNNING',
    SETUP_FAILED: 'SETUP_FAILED',
    START_FAILED: 'START_FAILED',
    STOP_FAILED: 'STOP_FAILED',
    TUNNEL_ERROR: 'TUNNEL_ERROR',
    LANGUAGE_NOT_DETECTED: 'LANGUAGE_NOT_DETECTED',
    INVALID_PROJECT_ID: 'INVALID_PROJECT_ID',
    FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
};

export class AppError extends Error {
    constructor(code, message, statusCode = 500) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}

export class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(ERROR_CODES.PROJECT_NOT_FOUND, message, 404);
        this.name = 'NotFoundError';
    }
}

export class ValidationError extends AppError {
    constructor(message = 'Validation failed') {
        super(ERROR_CODES.VALIDATION_ERROR, message, 400);
        this.name = 'ValidationError';
    }
}

export class SetupError extends AppError {
    constructor(message = 'Setup failed') {
        super(ERROR_CODES.SETUP_FAILED, message, 500);
        this.name = 'SetupError';
    }
}
