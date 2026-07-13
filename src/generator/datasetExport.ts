import type { DatasetRecord } from './datasetStore'
import { downloadBlob } from '../export/download'

/** One JSON object per line — the standard JSONL shape for the exported dataset. */
export function toJSONL(records: DatasetRecord[]): string {
  return records.map(r => JSON.stringify(r)).join('\n')
}

export function downloadDataset(records: DatasetRecord[]): void {
  const blob = new Blob([toJSONL(records)], { type: 'application/jsonl' })
  downloadBlob(blob, 'generator-dataset.jsonl')
}
