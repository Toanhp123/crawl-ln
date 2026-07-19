# BE Module Reorganization

- Chuẩn hóa module theo clean architecture sâu hơn.
- Tách `domain/entities` và `domain/repositories`.
- Tách `application/use-cases`, `application/services`, `application/ports`.
- Tách `infrastructure/persistence/sqlite` và `infrastructure/persistence/mappers`.
- Tách `presentation/controllers`, `presentation/dto`, `presentation/routes`.
- Thêm mapper riêng cho novel/chapter/task persistence.
- Thêm `CrawlerConfigPort` để application không phụ thuộc trực tiếp `env`.
- Thêm `LoggerPort` để service không phụ thuộc logger cụ thể.
- Inject `clock`, `logger`, `crawlerConfig` từ composition root.
- Kiểm tra import nội bộ: không còn import path gãy sau reorganize.
