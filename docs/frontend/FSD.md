# Web FSD structure

Web đã được dựng lại mobile-first theo Feature-Sliced Design.

```txt
src/
  app/                 app shell, providers, router, global styles
  pages/               route-level pages
  widgets/             large UI blocks composed from features/entities/shared
  features/            user actions: analyze, crawl, export, delete
  entities/            business entities: novel, chapter, task
  shared/
    api/               http client
    config/            environment config
    lib/               tiny utilities
    theme/             design tokens
    ui/                reusable UI grouped by role
```

Dependency rule:

```txt
app -> pages -> widgets -> features -> entities -> shared
```

Không import ngược chiều. Shared không biết domain. Entity không gọi API. Feature xử lý action/API. Widget compose feature + entity UI.
