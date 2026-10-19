import { Database, FolderTree, ArrowRightLeft, Table } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'csv-viewer',
    name: 'CSV Viewer',
    category: 'data',
    subcategory: 'tables',
    description: 'Open CSV or TSV files with RFC 4180 parsing, sort and filter columns, and export the filtered rows.',
    keywords: ['csv', 'tsv', 'table', 'viewer', 'sort', 'filter', 'delimiter', 'headers', 'rows'],
    formats: ['CSV', 'TSV'],
    icon: Table,
    load: () => import('./tools/csv-viewer'),
  },
  {
    id: 'csv-json-converter',
    name: 'CSV ⇄ JSON',
    category: 'data',
    subcategory: 'convert',
    description: 'Convert CSV to JSON records and back, with type inference and nested “a.b” headers.',
    keywords: ['csv', 'json', 'convert', 'table', 'rows', 'headers', 'nested', 'array'],
    formats: ['CSV', 'JSON'],
    icon: ArrowRightLeft,
    load: () => import('./tools/csv-json-converter'),
  },
  {
    id: 'json-tree-viewer',
    name: 'JSON Tree Viewer',
    category: 'data',
    subcategory: 'inspect',
    description: 'Explore JSON as a collapsible tree with node counts, key search and copyable JSONPath addresses.',
    keywords: ['json', 'tree', 'explorer', 'collapse', 'path', 'inspect', 'keys', 'array length'],
    formats: ['JSON'],
    icon: FolderTree,
    load: () => import('./tools/json-tree-viewer'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'data',
    name: 'Data Tools',
    description:
      'Work with tabular and structured data: inspect CSV, convert between CSV and JSON, explore JSON trees.',
    icon: Database,
    accent: 'green',
    subcategories: [
      { id: 'tables', name: 'Tables' },
      { id: 'convert', name: 'Convert' },
      { id: 'inspect', name: 'Inspect' },
    ],
  },
  tools,
};

export default category;
