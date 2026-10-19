/**
 * Tool registry — the single source of truth for navigation, search and the
 * dashboard. Category modules register themselves; nothing else in the shell
 * hard-codes tool lists.
 */
import type {
  CategoryDefinition,
  CategoryModule,
  SearchHit,
  ToolDefinition,
} from './types';

const categories = new Map<string, CategoryDefinition>();
const tools = new Map<string, ToolDefinition>();
const byCategory = new Map<string, ToolDefinition[]>();
const bySubcategory = new Map<string, ToolDefinition[]>();
const subKey = (categoryId: string, subId: string) => `${categoryId}/${subId}`;

export function registerCategoryModule(module: CategoryModule): void {
  const { category, tools: moduleTools } = module;

  if (!category.id) throw new Error('Category id is required');
  if (categories.has(category.id)) {
    throw new Error(`Duplicate category id: ${category.id}`);
  }
  categories.set(category.id, category);

  const knownSubs = new Set(category.subcategories.map((s) => s.id));
  const list: ToolDefinition[] = [];

  for (const tool of moduleTools) {
    if (tools.has(tool.id)) {
      throw new Error(`Duplicate tool id: ${tool.id}`);
    }
    if (tool.category !== category.id) {
      throw new Error(
        `Tool "${tool.id}" declares category "${tool.category}" but was registered in "${category.id}"`,
      );
    }
    if (!knownSubs.has(tool.subcategory)) {
      throw new Error(
        `Tool "${tool.id}" uses unknown subcategory "${tool.subcategory}" in "${category.id}"`,
      );
    }
    tools.set(tool.id, tool);
    list.push(tool);

    const key = subKey(category.id, tool.subcategory);
    const bucket = bySubcategory.get(key);
    if (bucket) bucket.push(tool);
    else bySubcategory.set(key, [tool]);
  }

  byCategory.set(category.id, list);
}

export function getCategories(): CategoryDefinition[] {
  return [...categories.values()];
}

export function getCategory(id: string | null | undefined): CategoryDefinition | undefined {
  if (!id) return undefined;
  return categories.get(id);
}

export function getTool(id: string | null | undefined): ToolDefinition | undefined {
  if (!id) return undefined;
  return tools.get(id);
}

export function getAllTools(): ToolDefinition[] {
  return [...tools.values()];
}

export function getToolsByCategory(categoryId: string): ToolDefinition[] {
  return byCategory.get(categoryId) ?? [];
}

export function getToolsBySubcategory(categoryId: string, subcategoryId: string): ToolDefinition[] {
  return bySubcategory.get(subKey(categoryId, subcategoryId)) ?? [];
}

export function getSubcategoryTools(categoryId: string): Map<string, ToolDefinition[]> {
  const result = new Map<string, ToolDefinition[]>();
  const category = categories.get(categoryId);
  if (!category) return result;
  for (const sub of category.subcategories) {
    result.set(sub.id, [...getToolsBySubcategory(categoryId, sub.id)]);
  }
  return result;
}

export function getToolCount(): number {
  return tools.size;
}

export function getCategoryAccent(categoryId: string): string | undefined {
  return categories.get(categoryId)?.accent;
}

/** Flattened, pre-lowered search index for fast filtering. */
interface IndexEntry {
  tool: ToolDefinition;
  name: string;
  categoryName: string;
  subName: string;
  keywords: string[];
  formats: string[];
  haystack: string;
}

let index: IndexEntry[] | null = null;

function buildIndex(): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const tool of tools.values()) {
    const category = categories.get(tool.category);
    const subName =
      category?.subcategories.find((s) => s.id === tool.subcategory)?.name ?? tool.subcategory;
    const keywords = tool.keywords.map((k) => k.toLowerCase());
    const formats = (tool.formats ?? []).map((f) => f.toLowerCase());
    entries.push({
      tool,
      name: tool.name.toLowerCase(),
      categoryName: (category?.name ?? tool.category).toLowerCase(),
      subName: subName.toLowerCase(),
      keywords,
      formats,
      haystack: [
        tool.name,
        tool.description,
        category?.name ?? '',
        subName,
        ...tool.keywords,
        ...(tool.formats ?? []),
      ]
        .join(' ')
        .toLowerCase(),
    });
  }
  return entries;
}

/**
 * Weighted full-substring search across names, keywords, formats and
 * categories. Multi-word queries must all match somewhere.
 */
export function searchTools(query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  if (!index) index = buildIndex();

  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const entry of index) {
    let total = 0;
    let matchedAll = true;

    for (const term of terms) {
      let termScore = 0;
      if (entry.name === term) termScore = 140;
      else if (entry.name.startsWith(term)) termScore = 96;
      else if (entry.name.includes(term)) termScore = 70;

      if (entry.keywords.some((k) => k === term)) termScore = Math.max(termScore, 84);
      else if (entry.keywords.some((k) => k.startsWith(term))) termScore = Math.max(termScore, 56);
      else if (entry.keywords.some((k) => k.includes(term))) termScore = Math.max(termScore, 36);

      if (entry.formats.some((f) => f === term)) termScore = Math.max(termScore, 60);
      else if (entry.formats.some((f) => f.startsWith(term))) termScore = Math.max(termScore, 40);

      if (entry.subName.includes(term)) termScore = Math.max(termScore, 30);
      else if (entry.categoryName.includes(term)) termScore = Math.max(termScore, 26);

      if (termScore === 0 && entry.haystack.includes(term)) termScore = 10;

      if (termScore === 0) {
        matchedAll = false;
        break;
      }
      total += termScore;
    }

    if (matchedAll && total > 0) hits.push({ tool: entry.tool, score: total });
  }

  hits.sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  return hits.slice(0, limit);
}

/**
 * "You may also need" — related tools for cross-discovery.
 * Same subcategory first, then shared keywords, then the rest of the category.
 */
export function relatedTools(toolId: string, limit = 6): ToolDefinition[] {
  const tool = tools.get(toolId);
  if (!tool) return [];
  const seen = new Set<string>([toolId]);
  const result: ToolDefinition[] = [];

  const push = (list: ToolDefinition[]) => {
    for (const candidate of list) {
      if (result.length >= limit) return;
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
    }
  };

  push(getToolsBySubcategory(tool.category, tool.subcategory));

  const keywordSet = new Set(tool.keywords.map((k) => k.toLowerCase()));
  const scored = getAllTools()
    .filter((t) => t.id !== toolId && !seen.has(t.id))
    .map((t) => ({
      tool: t,
      score: t.keywords.reduce((acc, k) => (keywordSet.has(k.toLowerCase()) ? acc + 1 : acc), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  push(scored.map((s) => s.tool));

  push(getToolsByCategory(tool.category));
  return result.slice(0, limit);
}

/** Suggested tools shown on the dashboard before the user has any history. */
export function popularTools(limit = 8): ToolDefinition[] {
  const preferred = [
    'image-format-converter',
    'image-resizer',
    'model-viewer',
    'model-converter',
    'image-compressor',
    'color-converter',
    'json-formatter',
    'sprite-sheet-generator',
    'background-remover',
    'texture-extractor',
    'guid-generator',
    'gif-to-sprite-sheet',
  ];
  const result: ToolDefinition[] = [];
  for (const id of preferred) {
    const tool = tools.get(id);
    if (tool) result.push(tool);
    if (result.length >= limit) return result;
  }
  for (const tool of tools.values()) {
    if (result.length >= limit) break;
    if (!result.some((t) => t.id === tool.id)) result.push(tool);
  }
  return result;
}
