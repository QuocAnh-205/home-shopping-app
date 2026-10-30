import { Logger } from '@nestjs/common';

// Unit test: tắt log Nest để output CI gọn, chỉ hiển thị kết quả test
Logger.overrideLogger(false);
