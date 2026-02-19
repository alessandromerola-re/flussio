export const sendError = (res, status, code, message, options = {}) => {
  const payload = {
    error: {
      code,
      message,
    },
  };

  if (options.field) {
    payload.error.field = options.field;
  }

  if (options.details) {
    payload.error.details = options.details;
  }

  payload.error_code = code;
  if (message) {
    payload.message = message;
  }

  return res.status(status).json(payload);
};
