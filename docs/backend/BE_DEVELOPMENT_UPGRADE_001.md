# BE Development Upgrade 001

Mục tiêu: nâng backend tiến gần chuẩn module-monolith clean nhưng vẫn thực dụng để chạy tốt trên Termux.

## Đã thêm

- API crawl job mới:
  - `POST /api/crawl/jobs`
  - `GET /api/crawl/jobs`
  - `GET /api/crawl/jobs/:id`
- API list chapter:
  - `GET /api/novels/:id/chapters`
- Use case mới:
  - `CreateCrawlJobUseCase`
  - `ListChaptersUseCase`
- Presentation riêng cho crawler:
  - `modules/crawler/presentation/controllers`
  - `modules/crawler/presentation/routes`
  - `modules/crawler/presentation/dto`
- Sửa `ClockPort` về đúng kiểu domain-agnostic: application nhận `Date`, nơi dùng tự format ISO.

## Giữ tương thích

Endpoint cũ `POST /api/novels/crawl` vẫn còn để FE cũ không vỡ ngay. Endpoint mới nên dùng là `POST /api/crawl/jobs`.

## Hướng tiếp theo

- Thêm cancel job: `POST /api/crawl/jobs/:id/cancel`.
- Tách `task` thành module `crawl-jobs` nếu muốn naming sạch tuyệt đối.
- Thêm adapter thật cho site novel mục tiêu.
- Thêm persistence log từng chapter nếu cần debug crawl nhiều nguồn.
