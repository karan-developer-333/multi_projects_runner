import { AppError } from '../constants/errors.js';
import { ApiResponse } from '../utils/responseFormatter.js';

export function errorMiddleware(err, req, res, next) {
    console.error(`[ERROR] ${err.name}: ${err.message}`);
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    if (err instanceof AppError) {
        return ApiResponse.error(res, err.message, err.code, err.statusCode);
    }

    if (err.name === 'SyntaxError' && err.status === 400) {
        return ApiResponse.badRequest(res, 'Invalid JSON in request body');
    }

    return ApiResponse.error(
        res,
        process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        'INTERNAL_ERROR',
        500
    );
}

export function notFoundMiddleware(req, res) {
    return ApiResponse.notFound(res, `Route ${req.method} ${req.path} not found`);
}
