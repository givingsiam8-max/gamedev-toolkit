/**
 * Category registry aggregator.
 *
 * Every category is a self-contained module under src/categories/<id>. Adding a
 * new category or tool means touching only that folder plus this list — the
 * navigation, search index, dashboard and favourites all pick it up
 * automatically.
 */
import { registerCategoryModule } from '../core/registry';
import type { CategoryModule } from '../core/types';

import threeD from './3d';
import images from './images';
import photo from './photo';
import textures from './textures';
import materials from './materials';
import unity from './unity';
import sprites from './sprites';
import audio from './audio';
import animation from './animation';
import files from './files';
import developer from './developer';
import optimization from './optimization';
import color from './color';
import data from './data';
import utilities from './utilities';

/** Sidebar order matches the documented category list. */
export const CATEGORY_MODULES: CategoryModule[] = [
  threeD,
  images,
  photo,
  textures,
  materials,
  unity,
  sprites,
  audio,
  animation,
  files,
  developer,
  optimization,
  color,
  data,
  utilities,
];

let registered = false;

export function registerAllCategories(): void {
  if (registered) return;
  for (const module of CATEGORY_MODULES) registerCategoryModule(module);
  registered = true;
}
