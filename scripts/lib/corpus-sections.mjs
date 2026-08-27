export const SECTION_REGISTRY_PATH = 'doc/_meta/materialized-sections.json';

export const CORPUS_SECTIONS = Object.freeze({
  apis: {
    description: 'API catalog and navigation',
    dependencies: [],
    files: [
      ['.github/templates/corpus-sections/apis/README.md', 'doc/project/apis/README.md'],
      ['.github/templates/corpus-sections/apis/index.md', 'doc/project/apis/index.md'],
      ['.github/templates/corpus-sections/apis/CATALOG.md', 'doc/project/apis/CATALOG.md'],
    ],
  },
  batches: {
    description: 'Scheduled jobs, workers and batch processing',
    dependencies: [],
    files: [
      ['.github/templates/corpus-sections/batches/README.md', 'doc/project/batchs/README.md'],
      ['.github/templates/corpus-sections/batches/index.md', 'doc/project/batchs/index.md'],
    ],
  },
  features: {
    description: 'Feature corpus root',
    dependencies: [],
    files: [
      ['.github/templates/corpus-sections/features/README.md', 'doc/project/features/README.md'],
      ['.github/templates/corpus-sections/features/index.md', 'doc/project/features/index.md'],
    ],
  },
  production: {
    description: 'Production and reliability knowledge root',
    dependencies: [],
    files: [
      ['.github/templates/corpus-sections/production/README.md', 'doc/prod/README.md'],
      ['.github/templates/corpus-sections/production/INDEX.md', 'doc/prod/INDEX.md'],
    ],
  },
  incidents: {
    description: 'Incident analyses',
    dependencies: ['production'],
    files: [
      ['.github/templates/corpus-sections/incidents/README.md', 'doc/prod/incidents/README.md'],
      ['.github/templates/corpus-sections/incidents/index.md', 'doc/prod/incidents/index.md'],
    ],
  },
});

export function orderedSections(sectionName, seen = new Set(), ordered = []) {
  const section = CORPUS_SECTIONS[sectionName];
  if (!section) throw new Error(`Unknown corpus section: ${sectionName}`);
  if (seen.has(sectionName)) return ordered;
  seen.add(sectionName);
  for (const dependency of section.dependencies) orderedSections(dependency, seen, ordered);
  ordered.push(sectionName);
  return ordered;
}
