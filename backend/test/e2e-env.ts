// Chạy trước khi import AppModule: LoggerModule đọc LOG_LEVEL lúc khởi tạo module
process.env.THROTTLE_DISABLED = 'true';
process.env.LOG_LEVEL ??= 'warn';
