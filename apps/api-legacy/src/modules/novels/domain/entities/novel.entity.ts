import type { Novel, NovelStatus } from '../models/novel.js';
import { NovelTitle } from '../value-objects/novel-title.vo.js';
import { SourceUrl } from '../value-objects/source-url.vo.js';

export class NovelEntity {
  private constructor(private readonly props: Novel) {}

  static create(props: Novel): NovelEntity {
    NovelTitle.create(props.title);
    SourceUrl.create(props.sourceUrl);
    return new NovelEntity({ ...props });
  }

  static analyze(params: {
    id: string;
    title: string;
    sourceUrl: string;
    sourceName: string;
    author?: string;
    coverUrl?: string;
    createdAt: string;
    updatedAt: string;
  }): NovelEntity {
    return NovelEntity.create({ ...params, status: 'analyzed' });
  }

  markCrawling(updatedAt: string): NovelEntity {
    return this.withStatus('crawling', updatedAt);
  }

  markCompleted(updatedAt: string): NovelEntity {
    return this.withStatus('completed', updatedAt);
  }

  markFailed(updatedAt: string): NovelEntity {
    return this.withStatus('failed', updatedAt);
  }

  canExport() {
    return (
      this.props.status === 'completed' ||
      this.props.status === 'crawling' ||
      this.props.status === 'analyzed'
    );
  }

  toPrimitives(): Novel {
    return { ...this.props };
  }

  private withStatus(status: NovelStatus, updatedAt: string) {
    return new NovelEntity({ ...this.props, status, updatedAt });
  }
}

export type NovelEntityPrimitives = Novel;
