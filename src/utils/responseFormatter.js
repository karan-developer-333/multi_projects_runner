export class ApiResponse {
    static success(res, data = {}, message = 'Success', statusCode = 200) {
        return res.status(statusCode).json({
            success: true,
            data,
            message
        });
    }

    static created(res, data, message = 'Created successfully') {
        return this.success(res, data, message, 201);
    }

    static error(res, message, code = 'ERROR', statusCode = 500) {
        return res.status(statusCode).json({
            success: false,
            data: null,
            error: {
                code,
                message
            }
        });
    }

    static notFound(res, message = 'Resource not found') {
        return this.error(res, message, 'NOT_FOUND', 404);
    }

    static badRequest(res, message = 'Bad request') {
        return this.error(res, message, 'BAD_REQUEST', 400);
    }

    static unauthorized(res, message = 'Unauthorized') {
        return this.error(res, message, 'UNAUTHORIZED', 401);
    }
}
