// Chạy trước khi import AppModule: LoggerModule đọc LOG_LEVEL lúc khởi tạo module
process.env.THROTTLE_DISABLED = 'true';
// Job nền không tự chạy trong test: test gọi trực tiếp để kết quả xác định
process.env.JOBS_ENABLED = 'false';
process.env.LOG_LEVEL ??= 'warn';
