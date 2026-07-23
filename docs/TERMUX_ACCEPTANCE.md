# Termux Android ARM64 Acceptance

Tài liệu này ghi nhận acceptance trên thiết bị Android ARM64 thật. Project phải nằm trong `$HOME` của Termux, không nằm trong Android shared storage.

## Thông tin môi trường

Điền trước khi chạy:

- Device model:
- Android version:
- Termux version:
- `node --version`:
- `npm --version`:
- `uname -m`:
- Browser executable, nếu có:

## Non-browser sequence bắt buộc

```bash
npm run setup
npm run check
npm test
npm run build
npm run dev
```

Với `npm run dev`, xác nhận:

- web mở tại `http://127.0.0.1:5173`;
- API health trả `200` tại `http://127.0.0.1:3000/health`;
- nhấn `Ctrl+C` đóng cả API và Vite;
- không còn child process sentinel sau shutdown.

Ghi kết quả từng lệnh:

| Command         | Result | Notes |
| --------------- | ------ | ----- |
| `npm run setup` |        |       |
| `npm run check` |        |       |
| `npm test`      |        |       |
| `npm run build` |        |       |
| `npm run dev`   |        |       |

## Browser capability tùy chọn

Playwright browser download chuẩn không được giả định là hỗ trợ trên Android. Chỉ chạy phần này khi đã cấu hình một Chromium-compatible executable:

```bash
export SOURCE_READER_BROWSER_EXECUTABLE=/absolute/path/to/chromium
npm run setup -- --browser
npm test -- --suite e2e
```

Ghi executable, probe result và E2E result. Nếu không cấu hình browser, đánh dấu phần này là “not requested”; non-browser acceptance vẫn phải hoàn tất.
