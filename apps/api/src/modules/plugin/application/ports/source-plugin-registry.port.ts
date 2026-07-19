import type { AnalyzeNovelResult, ChapterContentResult } from '../../domain/source-plugin.js';
import type { SourcePluginDescriptor } from '../../domain/source-plugin.js';

export type SourcePluginHandle = {
  id: string;
  canHandle(url: string): boolean | Promise<boolean>;
  analyze(url: string): Promise<AnalyzeNovelResult>;
  fetchChapter(url: string, signal?: AbortSignal): Promise<ChapterContentResult>;
};

export interface SourcePluginRegistryPort {
  list(): SourcePluginDescriptor[];
  handles(): SourcePluginHandle[];
  reload(): Promise<SourcePluginDescriptor[]>;
  setEnabled(pluginId: string, enabled: boolean): Promise<SourcePluginDescriptor>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
