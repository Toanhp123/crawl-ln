import type { AnalyzeNovelResult, ChapterContentResult } from '@novel-tool/shared';
import type { SourceAdapter } from '../../application/ports/source-adapter.port.js';

type PluginHandle = {
  canHandle(url: string): boolean | Promise<boolean>;
  analyze(url: string): Promise<AnalyzeNovelResult>;
  fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult>;
};
type PluginRegistryView = { handles(): PluginHandle[] };

export class PluginSourceAdapter implements SourceAdapter {
  readonly sourceName = 'dynamic-source-plugins';
  constructor(private readonly registry: PluginRegistryView) {}
  async canHandle(url: string) {
    return (await this.find(url)) != null;
  }
  async analyzeNovel(url: string): Promise<AnalyzeNovelResult> {
    return (await this.require(url)).analyze(url);
  }
  async fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult> {
    return (await this.require(url)).fetchChapter(url, signal);
  }
  private async find(url: string) {
    for (const handle of this.registry.handles()) if (await handle.canHandle(url)) return handle;
    return null;
  }
  private async require(url: string) {
    const handle = await this.find(url);
    if (!handle) throw new Error(`No active source plugin can handle ${url}`);
    return handle;
  }
}
