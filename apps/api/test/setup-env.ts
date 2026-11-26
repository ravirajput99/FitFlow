// Runs before each e2e test file. Values set here win over the repo-root .env.
process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT ??= '1000';
process.env.API_RATE_LIMIT ??= '10000';
process.env.OTP_PROVIDER = 'log';
