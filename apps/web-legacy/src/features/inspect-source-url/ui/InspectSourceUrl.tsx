import { useSourceInspector } from '../model/useSourceInspector';
import { SourceInspectorForm } from './SourceInspectorForm';

export function InspectSourceUrl() {
  return <SourceInspectorForm controller={useSourceInspector()} />;
}
