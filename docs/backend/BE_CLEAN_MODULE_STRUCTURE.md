# Backend Clean Module Structure

Mỗi module backend phải giữ vai trò rõ ràng:

```txt
modules/<module>/
  domain/
    entities/        # entity/value object/type thuộc nghiệp vụ
    repositories/    # repository contract, không biết DB

  application/
    use-cases/       # orchestration từng nghiệp vụ
      commands/      # mutation use case
      queries/       # read/query use case
    services/        # application service phối hợp logic nội bộ
    ports/           # outbound contract cần infrastructure implement

  infrastructure/
    persistence/
      sqlite/        # repository SQLite implementation
      mappers/       # DB row <-> domain mapper
    services/        # adapter service cụ thể: robots, rate limit...
    http/            # HTTP client adapter
    sources/         # source crawler adapter implementation

  presentation/
    controllers/     # Express controller mỏng
    dto/             # input validation schema
    routes/          # Express routes
```

## Rule chính

- `domain` không import `application`, `infrastructure`, `presentation`.
- `application` chỉ import `domain`, `shared`, hoặc `application/ports` của module khác khi thật cần.
- `infrastructure` implement repository/port, được import DB, HTTP client, SDK.
- `presentation` chỉ parse request, gọi use case, trả response.
- Mapper DB luôn nằm trong `infrastructure/persistence/mappers`.
- Repository interface luôn nằm trong `domain/repositories`.
- Entity/type nghiệp vụ luôn nằm trong `domain/entities`.
- Queue/config/logger/time là port hoặc shared contract, không hard-code trong use case.

## Status hiện tại

Đã reorganize các module chính:

- `novels`
- `chapters`
- `task`
- `crawler`

Crawler hiện còn là application service chạy in-memory, phù hợp MVP Termux. Khi nâng cấp sang queue thật, chỉ cần thay implementation của `CrawlQueuePort`.
